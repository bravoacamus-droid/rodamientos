import "server-only";

import { consultarDni, consultarRuc, type ContextoConsultas } from "@rodatech/consultas";
import { envOpcional } from "@rodatech/config";
import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Consulta de RUC/DNI contra SUNAT/RENIEC, compartida por los maestros.
 *
 * Vive aquí y no dentro de un módulo porque **la cuota es una sola**: son 100
 * consultas gratis al mes para toda la empresa, las gaste el alta de clientes
 * o la de proveedores. Con una copia por módulo, cualquier arreglo de la
 * validación previa —la que evita quemar cuota con un RUC mal tecleado—
 * habría que hacerlo en dos sitios, y el día que divergieran uno de los dos
 * empezaría a gastar de más sin que nadie se enterase.
 *
 * Lo que NO hace: comprobar el rol. Cada módulo tiene el suyo —ventas da de
 * alta clientes, compras da de alta proveedores— y esa decisión se queda en su
 * Server Action, que es la frontera pública.
 *
 * Dos reglas mandan sobre todo lo demás:
 *
 *  1. Un documento que no pasa la validación local NUNCA sale a la red.
 *  2. Esto es una ayuda, no un requisito. Si no hay cupo, si no hay token o si
 *     Decolecta está caído, el alta se completa a mano. Devuelve un error
 *     explicando qué pasó; jamás lanza ni bloquea el formulario.
 */

export type TipoDocumentoConsultable = "RUC" | "DNI";

/** Lo que devuelve la consulta, ya normalizado. */
export interface DatosSunat {
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string | null;
  ubigeo_codigo: string | null;
  /**
   * Los tres nombres del distrito, tal como los devuelve SUNAT.
   *
   * Se propagan desde la 036 porque `ubigeo` no es el padrón completo: con el
   * código a secas, un distrito que no tengamos cargado no se puede dar de
   * alta y se pierde. Con los tres nombres sí — y quien los da es la misma
   * autoridad que después valida el documento.
   *
   * Vienen como los manda SUNAT: MAYÚSCULAS y sin tildes.
   */
  ubigeo_departamento: string | null;
  ubigeo_provincia: string | null;
  ubigeo_distrito: string | null;
  /** Estado del contribuyente: ACTIVO, BAJA DE OFICIO… Solo informativo. */
  estado: string | null;
  /** HABIDO / NO HABIDO. Importa: a un NO HABIDO no se le factura tranquilo. */
  condicion: string | null;
}

export type ResultadoSunat =
  | { ok: true; datos: DatosSunat; consumioCuota: boolean }
  | { ok: false; error: string; agotada?: boolean };

/**
 * Prioridad de estas consultas.
 *
 * `normal` y no `critical`, siguiendo la regla del paquete: si el usuario
 * puede escribir el dato a mano —y en un alta siempre puede—, no es crítica.
 * La reserva del último 5 % del ciclo queda para lo que de verdad no se puede
 * resolver de otra forma.
 */
const PRIORIDAD = "normal" as const;

/** Códigos del paquete que significan «no hay cupo», no «el dato está mal». */
const CODIGOS_SIN_CUPO = ["CUOTA_LOCAL_AGOTADA", "CUOTA_PROVEEDOR_AGOTADA"];

/**
 * Contexto del paquete de consultas.
 *
 * El cliente de Supabase se pasa con la identidad del usuario (no el de
 * servicio) para que la cuota y la caché queden bajo RLS como todo lo demás.
 * El cast es necesario porque `@rodatech/consultas` declara su propio contrato
 * mínimo de cliente a propósito, para no acoplarse a una versión del SDK; el
 * cliente real lo cumple de sobra.
 */
async function contexto(): Promise<ContextoConsultas> {
  const supabase = await clienteServidor();
  return {
    cliente: supabase as unknown as ContextoConsultas["cliente"],
    // `envOpcional` y no `requerirEnv`: sin token el paquete degrada a
    // "escribe a mano", que es exactamente lo que se quiere. Reventar aquí
    // dejaría el alta inservible por una variable de entorno.
    token: envOpcional("DECOLECTA_TOKEN"),
    cuota: {
      plan: envOpcional("DECOLECTA_PLAN") ?? "free",
      limite: Number(envOpcional("DECOLECTA_QUOTA_LIMIT") ?? 100),
      reservaPorcentaje: Number(envOpcional("DECOLECTA_QUOTA_RESERVE_PCT") ?? 5),
      diaCicloReinicio: Number(envOpcional("DECOLECTA_QUOTA_CYCLE_DAY") ?? 1),
    },
    timeoutMs: Number(envOpcional("DECOLECTA_TIMEOUT_MS") ?? 10_000),
  };
}

/** El ubigeo solo sirve si es una clave del maestro: 6 dígitos exactos. */
function ubigeoUtilizable(valor: string | null): string | null {
  return valor !== null && /^\d{6}$/.test(valor) ? valor : null;
}

/**
 * Trae los datos del documento.
 *
 * `numero` tiene que venir YA validado por el dominio del módulo que llama
 * —esa validación es la que protege la cuota— y ya normalizado a solo
 * dígitos.
 */
export async function consultarDocumentoSunat(
  tipo: TipoDocumentoConsultable,
  numero: string,
): Promise<ResultadoSunat> {
  try {
    const ctx = await contexto();

    if (tipo === "RUC") {
      const r = await consultarRuc(numero, ctx, { prioridad: PRIORIDAD });
      if (!r.ok || !r.datos) return traducirFallo(r);

      return {
        ok: true,
        datos: {
          razon_social: r.datos.razonSocial,
          // El endpoint básico de SUNAT no trae nombre comercial. Se deja en
          // null en vez de repetir la razón social: son campos distintos y
          // copiarlos haría creer que el dato vino de SUNAT.
          nombre_comercial: null,
          direccion: r.datos.direccion,
          ubigeo_codigo: ubigeoUtilizable(r.datos.ubigeo),
          ubigeo_departamento: r.datos.departamento,
          ubigeo_provincia: r.datos.provincia,
          ubigeo_distrito: r.datos.distrito,
          estado: r.datos.estado,
          condicion: r.datos.condicion,
        },
        // Solo `api` gastó una consulta; caché y caché rancia no tocaron la red.
        consumioCuota: r.origen === "api",
      };
    }

    const r = await consultarDni(numero, ctx, { prioridad: PRIORIDAD });
    if (!r.ok || !r.datos) return traducirFallo(r);

    return {
      ok: true,
      datos: {
        // Una persona natural no tiene razón social: su nombre completo ocupa
        // ese campo, que es lo que va impreso en la boleta.
        razon_social: r.datos.nombreCompleto,
        nombre_comercial: null,
        direccion: null,
        ubigeo_codigo: null,
        ubigeo_departamento: null,
        ubigeo_provincia: null,
        ubigeo_distrito: null,
        estado: null,
        condicion: null,
      },
      consumioCuota: r.origen === "api",
    };
  } catch (e) {
    // Cinturón y tirantes: el paquete promete no lanzar, pero si algo se
    // escapara, el alta a mano tiene que seguir siendo posible.
    return {
      ok: false,
      error:
        e instanceof Error
          ? `No se pudo consultar el documento (${e.message}). Escribe los datos a mano.`
          : "No se pudo consultar el documento. Escribe los datos a mano.",
    };
  }
}

/**
 * Traduce un fallo del paquete.
 *
 * `agotada` se marca SOLO cuando no hay cupo, porque la interfaz la usa para
 * decir "sigue a mano, la consulta volverá el mes que viene". Un documento que
 * no existe en SUNAT no es eso, y confundirlos haría creer que se acabó la
 * cuota cada vez que alguien teclea un RUC de baja.
 */
function traducirFallo(r: {
  origen: string;
  mensaje: string | null;
  errorCodigo: string | null;
}): ResultadoSunat {
  const sinCupo =
    r.origen === "quota_blocked" ||
    (r.errorCodigo !== null && CODIGOS_SIN_CUPO.includes(r.errorCodigo));

  if (sinCupo) {
    return {
      ok: false,
      agotada: true,
      error:
        r.mensaje ??
        "Se agotaron las consultas del mes. Escribe los datos a mano: el alta funciona igual.",
    };
  }

  return {
    ok: false,
    error: r.mensaje ?? "No se pudo consultar el documento. Escribe los datos a mano.",
  };
}
