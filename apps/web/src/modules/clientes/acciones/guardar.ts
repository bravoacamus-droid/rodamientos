"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { codigoDeCliente, revisarDocumento, variante } from "../dominio/documento";
import type { ClienteEditable, ResultadoCliente } from "../dominio/tipos";

/**
 * Alta y edición de un cliente del maestro.
 *
 * Alta rápida: tipo de documento, número y razón social. Nada más. Willy fue
 * textual —*"hay muchos clientes técnicos que a las justas me dan correo"*—,
 * así que exigir dirección o teléfono para poder cotizar es como se termina
 * con un maestro lleno de "SIN DATO" y de clientes creados sobre la marcha.
 */

/**
 * Quién puede escribir en el maestro.
 *
 * `cobranzas` también tiene permiso en `permisos_rol` (necesita marcar
 * bloqueos), pero el alta y la edición de la ficha comercial son de ventas.
 * La lista de aquí es la primera línea; la de verdad la aplica RLS en Postgres.
 */
const ROLES = ["gerencia", "admin", "ventas"] as const;

/** Cuántos códigos alternativos se prueban antes de rendirse. */
const MAX_INTENTOS_CODIGO = 25;

const TIPOS_DOCUMENTO = ["RUC", "DNI", "CE", "PAS", "SIN_DOC"] as const;

/**
 * Texto opcional.
 *
 * La cadena vacía se guarda como `null` y no como "". Un "" en `email` pasa
 * cualquier validación pero luego no se puede distinguir de un correo real al
 * filtrar, y un "" en `ubigeo_codigo` rompería directamente la clave foránea.
 */
function opcional(max: number, etiqueta: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t === "" ? null : t;
    })
    .refine((v) => v === null || v.length <= max, `${etiqueta} es demasiado largo.`);
}

/** Número que puede llegar como número o como texto de un input. */
function numero(max: number, etiqueta: string) {
  return z.coerce
    .number()
    .finite(`${etiqueta} no es un número.`)
    .nonnegative(`${etiqueta} no puede ser negativo.`)
    .max(max, `${etiqueta} es demasiado grande.`)
    .default(0);
}

const esquema = z.object({
  id: z.string().uuid().optional(),

  // --- Lo único obligatorio ------------------------------------------------
  tipo_documento: z.enum(TIPOS_DOCUMENTO, {
    errorMap: () => ({ message: "Elige un tipo de documento." }),
  }),
  // El número se valida a fondo en `dominio/documento`: aquí solo se acota el
  // tamaño para que no llegue un megabyte de texto a la validación.
  numero_documento: opcional(40, "El número de documento"),
  razon_social: z
    .string()
    .trim()
    .min(2, "Falta la razón social.")
    .max(200, "La razón social es demasiado larga."),

  // --- Todo lo de «más datos» ----------------------------------------------
  nombre_comercial: opcional(200, "El nombre comercial"),
  direccion: opcional(300, "La dirección"),
  ubigeo_codigo: opcional(6, "El ubigeo").refine(
    (v) => v === null || /^\d{6}$/.test(v),
    "El ubigeo debe tener 6 dígitos. Elígelo de la lista.",
  ),
  referencia_direccion: opcional(200, "La referencia"),
  sector: opcional(80, "El sector"),
  contacto: opcional(120, "El contacto"),
  cargo_contacto: opcional(80, "El cargo del contacto"),
  email: opcional(160, "El correo").refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    "El correo no tiene un formato válido.",
  ),
  telefono: opcional(40, "El teléfono"),
  whatsapp: opcional(40, "El WhatsApp"),

  condicion_pago: z.enum(["contado", "credito"], {
    errorMap: () => ({ message: "Elige la condición de pago." }),
  }),
  // Los topes salen del esquema: `linea_credito` es numeric(14,2) y los días
  // son smallint. Recortar aquí da un mensaje entendible en vez de un error
  // de desbordamiento de Postgres.
  linea_credito: numero(99_999_999, "La línea de crédito"),
  dias_credito: numero(365, "Los días de crédito"),
  dias_gracia: numero(365, "Los días de gracia"),

  vendedor_id: opcional(36, "El vendedor").refine(
    (v) => v === null || z.string().uuid().safeParse(v).success,
    "El vendedor elegido no es válido.",
  ),
  notas: opcional(2000, "Las notas"),
});

/** ¿Es una violación de índice único? */
function esDuplicado(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * Cuál de los dos índices únicos saltó.
 *
 * `clientes` tiene dos: `ux_clientes_codigo` sobre normalizar_codigo(codigo) y
 * `ux_clientes_documento` sobre (tipo_documento, numero_documento). Uno se
 * resuelve solo —reintentando con otro código— y el otro es un cliente que ya
 * existe y hay que decir cuál. Confundirlos sería crear un duplicado o
 * rechazar un alta legítima.
 */
function indiceQueSalto(error: { message?: string; details?: string | null }): string {
  return `${error.message ?? ""} ${error.details ?? ""}`;
}

/**
 * Mensaje que nombra al cliente que ya está en el maestro.
 *
 * Se busca DESPUÉS del choque y no antes: comprobar primero y luego insertar
 * deja una ventana en la que dos altas simultáneas pasan las dos. El índice
 * único es el que decide; esto solo traduce su error a algo accionable.
 */
async function mensajeDeDuplicado(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  tipo: (typeof TIPOS_DOCUMENTO)[number],
  numeroDocumento: string,
): Promise<string> {
  const { data } = await supabase
    .from("clientes")
    .select("codigo, razon_social, activo")
    .eq("tipo_documento", tipo)
    .eq("numero_documento", numeroDocumento)
    .maybeSingle();

  if (!data) {
    return `Ya hay un cliente registrado con el ${tipo} ${numeroDocumento}.`;
  }
  const desactivado = data.activo ? "" : " (está desactivado: reactívalo en vez de crearlo de nuevo)";
  return `El ${tipo} ${numeroDocumento} ya es de ${data.razon_social}, código ${data.codigo}${desactivado}.`;
}

export async function guardarCliente(
  _previo: ResultadoCliente | null,
  formData: FormData,
): Promise<ResultadoCliente> {
  // 1 · Identidad y rol. Una Server Action es un endpoint público: sin esto,
  // cualquiera con una sesión de almacén escribe en el maestro comercial.
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return {
      ok: false,
      error: "Tu rol no puede dar de alta ni editar clientes. Lo hacen Ventas o Gerencia.",
    };
  }

  // 2 · Entrada. Hostil hasta que zod diga lo contrario.
  const crudo = formData.get("cliente");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos del formulario." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    if (e instanceof z.ZodError) {
      const primero = e.issues[0];
      return {
        ok: false,
        error: primero?.message ?? "Los datos no son válidos.",
        campo: primero?.path[0] as keyof ClienteEditable | undefined,
      };
    }
    return { ok: false, error: "Los datos no son válidos." };
  }

  // 3 · El documento, con su dígito verificador. La restricción
  // `clientes_documento_ok` de la base diría lo mismo, pero en un idioma que
  // no se le puede enseñar a nadie.
  const revision = revisarDocumento(datos.tipo_documento, datos.numero_documento);
  if (!revision.ok) {
    return { ok: false, campo: "numero_documento", error: revision.error };
  }
  const numeroDocumento = revision.numero;

  const campos = {
    tipo_documento: datos.tipo_documento,
    numero_documento: numeroDocumento,
    razon_social: datos.razon_social,
    nombre_comercial: datos.nombre_comercial,
    direccion: datos.direccion,
    ubigeo_codigo: datos.ubigeo_codigo,
    referencia_direccion: datos.referencia_direccion,
    sector: datos.sector,
    contacto: datos.contacto,
    cargo_contacto: datos.cargo_contacto,
    email: datos.email,
    telefono: datos.telefono,
    whatsapp: datos.whatsapp,
    condicion_pago: datos.condicion_pago,
    linea_credito: datos.linea_credito,
    dias_credito: datos.dias_credito,
    dias_gracia: datos.dias_gracia,
    vendedor_id: datos.vendedor_id,
    notas: datos.notas,
  };

  try {
    const supabase = await clienteServidor();

    // 4 · Edición: el código NO se toca. Es la referencia que ya circula en
    // cotizaciones impresas y en la cabeza de la gente; regenerarlo porque
    // cambió la razón social rompería esa referencia.
    if (datos.id) {
      const { data, error } = await supabase
        .from("clientes")
        .update({ ...campos, actualizado_en: new Date().toISOString() })
        .eq("id", datos.id)
        .select("id, codigo, razon_social")
        .maybeSingle();

      if (error) {
        if (esDuplicado(error) && numeroDocumento) {
          return {
            ok: false,
            campo: "numero_documento",
            error: await mensajeDeDuplicado(supabase, datos.tipo_documento, numeroDocumento),
          };
        }
        return { ok: false, error: error.message };
      }
      if (!data) {
        return { ok: false, error: "El cliente no existe o no tienes permiso para editarlo." };
      }

      revalidar(data.id);
      return { ok: true, id: data.id, codigo: data.codigo, razonSocial: data.razon_social };
    }

    // 5 · Alta. El código lo genera el servidor: es NOT NULL, es único por
    // expresión y el usuario no debería tener que inventarlo.
    const base = codigoDeCliente(datos.tipo_documento, numeroDocumento, datos.razon_social);

    for (let intento = 0; intento <= MAX_INTENTOS_CODIGO; intento++) {
      const codigo = intento === 0 ? base : variante(base, intento + 1);

      const { data, error } = await supabase
        .from("clientes")
        .insert({ ...campos, codigo })
        .select("id, codigo, razon_social")
        .maybeSingle();

      if (!error && data) {
        revalidar(data.id);
        return { ok: true, id: data.id, codigo: data.codigo, razonSocial: data.razon_social };
      }

      if (error && esDuplicado(error)) {
        const indice = indiceQueSalto(error);

        // Documento repetido: es el mismo cliente otra vez. Reintentar con
        // otro código solo crearía el duplicado que el índice está evitando.
        if (indice.includes("ux_clientes_documento") && numeroDocumento) {
          return {
            ok: false,
            campo: "numero_documento",
            error: await mensajeDeDuplicado(supabase, datos.tipo_documento, numeroDocumento),
          };
        }

        // Código repetido: es cosa nuestra, no del usuario. Se prueba el
        // siguiente candidato sin que nadie se entere.
        if (indice.includes("ux_clientes_codigo")) continue;

        // 23505 sin índice reconocible: mejor decirlo que reintentar a ciegas.
        return { ok: false, error: error.message };
      }

      if (error) return { ok: false, error: error.message };
      return { ok: false, error: "No se pudo guardar el cliente." };
    }

    return {
      ok: false,
      error: `No se pudo generar un código libre a partir de "${base}". Avisa a sistemas.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el cliente.",
    };
  }
}

/**
 * Bloquear y desbloquear un cliente.
 *
 * Bloquear NO es desactivar ni borrar: el cliente sigue en el maestro con todo
 * su historial y sus documentos emitidos, pero deja de poder cotizarse. Por eso
 * es un flag con motivo y no un DELETE — un cliente con facturas pendientes no
 * se puede borrar (la FK es `on delete restrict`) y tampoco se querría.
 *
 * El motivo es obligatorio al bloquear y se borra al desbloquear: un bloqueo
 * sin explicación es el que nadie se atreve a levantar tres meses después.
 */
export async function bloquearCliente(
  id: string,
  bloquear: boolean,
  motivo?: string,
): Promise<{ ok: boolean; error?: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede bloquear clientes." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Cliente no válido." };
  }

  const razon = typeof motivo === "string" ? motivo.trim() : "";
  if (bloquear && razon.length < 4) {
    return { ok: false, error: "Escribe el motivo del bloqueo." };
  }
  if (razon.length > 300) {
    return { ok: false, error: "El motivo es demasiado largo." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("clientes")
      .update(
        bloquear
          ? { bloqueado: true, motivo_bloqueo: razon, actualizado_en: new Date().toISOString() }
          : { bloqueado: false, motivo_bloqueo: null, actualizado_en: new Date().toISOString() },
      )
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar." };
  }
}

/**
 * Invalida lo que muestra este cliente.
 *
 * `/cotizaciones/nueva` entra en la lista porque su selector de cliente lee el
 * maestro entero: sin esto, el cliente recién creado no aparece al cotizar,
 * que es justo el momento en que se acaba de crear.
 */
function revalidar(id: string): void {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/cotizaciones/nueva");
}
