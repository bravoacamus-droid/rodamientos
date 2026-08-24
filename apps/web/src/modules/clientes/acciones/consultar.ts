"use server";

import { consultarDni, consultarRuc, type ContextoConsultas } from "@rodatech/consultas";
import { envOpcional } from "@rodatech/config";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { esConsultable, revisarDocumento } from "../dominio/documento";
import type { DatosDocumento, ResultadoDocumento, TipoDocumento } from "../dominio/tipos";

/**
 * Traer de SUNAT/RENIEC los datos de un documento para llenar el alta.
 *
 * Dos reglas mandan sobre todo lo demás:
 *
 *  1. Son 100 consultas gratis al mes y no se recargan. Un documento que no
 *     pasa la validación local NUNCA sale a la red.
 *  2. Esto es una ayuda, no un requisito. Si no hay cupo, si no hay token o si
 *     Decolecta está caído, el alta se completa a mano. Esta acción devuelve
 *     un error explicando qué pasó; jamás lanza ni bloquea el formulario.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;

/**
 * Prioridad de estas consultas.
 *
 * `normal` y no `critical`, siguiendo la regla del paquete: si el usuario
 * puede escribir el dato a mano —y aquí siempre puede—, no es crítica. La
 * reserva del último 5 % del ciclo queda para lo que de verdad no se puede
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
    // `envOpcional` y no `requerirEnv`: sin token el paquete degrada a "escribe
    // a mano", que es exactamente el comportamiento que se quiere. Reventar
    // aquí dejaría el alta de clientes inservible por una variable de entorno.
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

export async function buscarPorDocumento(
  tipo: TipoDocumento,
  numero: string,
): Promise<ResultadoDocumento> {
  // 1 · Identidad y rol. Cada llamada de aquí gasta cuota compartida de la
  // empresa: no puede quedar abierta a cualquiera con una sesión.
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede consultar documentos." };
  }

  // 2 · Entrada. Los argumentos de una Server Action llegan del navegador:
  // `tipo` podría ser cualquier cosa y `numero` un texto arbitrariamente largo.
  if (!["RUC", "DNI", "CE", "PAS", "SIN_DOC"].includes(tipo)) {
    return { ok: false, error: "Tipo de documento no válido." };
  }
  if (typeof numero !== "string" || numero.length > 40) {
    return { ok: false, error: "El número de documento no es válido." };
  }

  // 3 · Validación local ANTES de gastar nada. Un RUC con el dígito
  // verificador mal es el error de tecleo más común y el más caro: sin esto,
  // cada uno se lleva por delante una de las 100 consultas del mes.
  const revision = revisarDocumento(tipo, numero);
  if (!revision.ok) return { ok: false, error: revision.error };

  if (!esConsultable(tipo, numero)) {
    return {
      ok: false,
      error:
        "Solo se pueden consultar RUC y DNI. El carné de extranjería y el pasaporte se escriben a mano.",
    };
  }

  const documento = revision.numero as string;

  try {
    const ctx = await contexto();

    if (tipo === "RUC") {
      const r = await consultarRuc(documento, ctx, { prioridad: PRIORIDAD });
      if (!r.ok || !r.datos) return traducirFallo(r);

      const datos: DatosDocumento = {
        razon_social: r.datos.razonSocial,
        // El endpoint básico de SUNAT no trae nombre comercial. Se deja en
        // null en vez de repetir la razón social: son campos distintos y
        // copiarlos haría creer que el dato vino de SUNAT.
        nombre_comercial: null,
        direccion: r.datos.direccion,
        ubigeo_codigo: ubigeoUtilizable(r.datos.ubigeo),
        estado: r.datos.estado,
        condicion: r.datos.condicion,
      };
      // Solo `api` gastó una consulta; caché y caché rancia no tocaron la red.
      return { ok: true, datos, consumioCuota: r.origen === "api" };
    }

    const r = await consultarDni(documento, ctx, { prioridad: PRIORIDAD });
    if (!r.ok || !r.datos) return traducirFallo(r);

    const datos: DatosDocumento = {
      // Una persona natural no tiene razón social: su nombre completo ocupa
      // ese campo, que es lo que va impreso en la boleta.
      razon_social: r.datos.nombreCompleto,
      nombre_comercial: null,
      direccion: null,
      ubigeo_codigo: null,
      estado: null,
      condicion: null,
    };
    return { ok: true, datos, consumioCuota: r.origen === "api" };
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
 * Traduce un fallo del paquete al contrato del módulo.
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
}): ResultadoDocumento {
  const sinCupo =
    r.origen === "quota_blocked" || (r.errorCodigo !== null && CODIGOS_SIN_CUPO.includes(r.errorCodigo));

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
