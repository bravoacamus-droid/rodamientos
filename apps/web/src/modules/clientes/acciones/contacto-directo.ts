"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Apuntarle el teléfono o el correo al cliente sin salir de la cotización.
 *
 * ---------------------------------------------------------------------------
 * Por qué hace falta
 * ---------------------------------------------------------------------------
 * Willy pidió mandar la cotización por WhatsApp y por correo (13:00 y 13:21).
 * Los dos botones existen — y con los datos de HOY no aparece ninguno: de los
 * **97 clientes activos, 0 tienen teléfono o WhatsApp y 1 tiene correo**.
 * Entraron del Excel sin esa columna.
 *
 * O sea, la función estaba y no la iba a ver nadie. Es el mismo caso que el
 * teléfono del proveedor en «Pedir precio», y se resuelve igual: se apunta
 * aquí mismo, en el momento en que hace falta, que es cuando se tiene delante.
 *
 * ---------------------------------------------------------------------------
 * Por qué no vale `guardarCliente`
 * ---------------------------------------------------------------------------
 * Esa guarda la ficha ENTERA y valida el RUC, la condición de pago, el ubigeo
 * y media docena de campos más. Con 97 clientes a medio llenar, la validación
 * completa rebotaría el guardado por algo que no tiene nada que ver con el
 * número que acaban de dar por teléfono.
 */

const esquema = z.object({
  id: z.string().uuid(),
  // Los tres opcionales y los tres a la vez: se apunta lo que se sepa. Vaciar
  // uno también es una decisión válida.
  telefono: z.string().trim().max(40).nullable().default(null),
  whatsapp: z.string().trim().max(40).nullable().default(null),
  email: z.string().trim().max(160).nullable().default(null),
});

export type ResultadoContactoCliente = { ok: true } | { ok: false; error: string };

const limpio = (v: string | null) => (v === null || v.trim() === "" ? null : v.trim());

export async function ponerContactoCliente(
  datosCrudos: unknown,
): Promise<ResultadoContactoCliente> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("clientes", "editar");
  if (negado) {
    return { ok: false, error: negado };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(datosCrudos);
  } catch {
    return { ok: false, error: "Los datos de contacto no son válidos." };
  }

  const correo = limpio(datos.email);
  if (correo !== null && !z.string().email().safeParse(correo).success) {
    return { ok: false, error: "Ese correo no tiene un formato válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("clientes")
      .update({
        telefono: limpio(datos.telefono),
        whatsapp: limpio(datos.whatsapp),
        email: correo,
      })
      .eq("id", datos.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${datos.id}`);
    // La cotización es desde donde se apunta: sin esto, el botón de WhatsApp
    // no aparecería hasta recargar a mano.
    revalidatePath("/cotizaciones", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el contacto.",
    };
  }
}

/* ------------------------------------------------------------------------ */
/*  Corregir el cliente desde la cotización (auditoría 27/10, FS-01)          */
/* ------------------------------------------------------------------------ */

/**
 * Lo que enseña «Editar cliente» al abrirse.
 *
 * `buscar_clientes` (030) devuelve lo justo para elegir —nombre, documento,
 * crédito, teléfono— y no el correo, el WhatsApp ni la dirección. Ampliar esa
 * función pediría migración; esto es una lectura de una fila, solo cuando se
 * abre el diálogo, y de paso trae los datos de AHORA y no los de cuando se
 * eligió el cliente.
 */
export interface DatosClienteCorregible {
  id: string;
  razon_social: string;
  tipo_documento: string;
  numero_documento: string | null;
  /** Con RUC o DNI el nombre es el del padrón y aquí no se toca. */
  razon_social_oficial: boolean;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  direccion: string | null;
  ubigeo_codigo: string | null;
  ubigeo_departamento: string | null;
  ubigeo_provincia: string | null;
  ubigeo_distrito: string | null;
}

/**
 * ¿La razón social es la oficial?
 *
 * Con RUC o DNI el nombre es el que dan SUNAT o RENIEC: corregirlo de pasada,
 * en mitad de una llamada, es como acaba una factura con un nombre que no
 * casa con el RUC. Eso se hace en la ficha, que vuelve a consultar el padrón.
 * Sin documento —o con carné de extranjería o pasaporte— no hay padrón que
 * consultar y el nombre es el que se escribió a mano.
 */
function razonSocialEsOficial(tipo: string, numero: string | null): boolean {
  return (tipo === "RUC" || tipo === "DNI") && Boolean(numero?.trim());
}

export async function datosParaCorregirCliente(
  id: unknown,
): Promise<{ ok: true; datos: DatosClienteCorregible } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const valido = z.string().uuid().safeParse(id);
  if (!valido.success) return { ok: false, error: "Cliente no válido." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clientes")
      .select(
        `id, razon_social, tipo_documento, numero_documento, telefono, whatsapp, email,
         direccion, ubigeo_codigo,
         ubigeo:ubigeo!clientes_ubigeo_codigo_fkey(departamento, provincia, distrito)`,
      )
      .eq("id", valido.data)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "El cliente no existe." };

    const ubigeo = data.ubigeo as { departamento: string; provincia: string; distrito: string } | null;
    return {
      ok: true,
      datos: {
        id: data.id,
        razon_social: data.razon_social,
        tipo_documento: data.tipo_documento,
        numero_documento: data.numero_documento,
        razon_social_oficial: razonSocialEsOficial(data.tipo_documento, data.numero_documento),
        telefono: data.telefono,
        whatsapp: data.whatsapp,
        email: data.email,
        direccion: data.direccion,
        ubigeo_codigo: data.ubigeo_codigo,
        ubigeo_departamento: ubigeo?.departamento ?? null,
        ubigeo_provincia: ubigeo?.provincia ?? null,
        ubigeo_distrito: ubigeo?.distrito ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el cliente." };
  }
}

/** Texto opcional: la cadena vacía es `null`, como en `guardar.ts`. */
function textoOpcional(max: number, etiqueta: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t === "" ? null : t;
    })
    .refine((v) => v === null || v.length <= max, `${etiqueta} es demasiado largo.`);
}

/*
  Las mismas reglas de dirección y ubigeo que `guardarCliente`: dirección de
  hasta 300, ubigeo de seis dígitos o nada, y los tres nombres del distrito
  para `asegurar_ubigeo` (036).
*/
const esquemaDireccion = z.object({
  id: z.string().uuid(),
  direccion: textoOpcional(300, "La dirección"),
  ubigeo_codigo: textoOpcional(6, "El ubigeo").refine(
    (v) => v === null || /^\d{6}$/.test(v),
    "El ubigeo debe tener 6 dígitos. Elígelo de la lista.",
  ),
  ubigeo_departamento: textoOpcional(80, "El departamento"),
  ubigeo_provincia: textoOpcional(80, "La provincia"),
  ubigeo_distrito: textoOpcional(80, "El distrito"),
  // Solo si no es la oficial (ver `razonSocialEsOficial`). Ausente = no se toca.
  razon_social: z
    .string()
    .trim()
    .min(2, "Falta la razón social.")
    .max(200, "La razón social es demasiado larga.")
    .optional(),
});

/**
 * Corregir la dirección y el distrito —y la razón social, si no es la del
 * padrón— sin salir de la cotización.
 *
 * No usa `guardarCliente` por lo mismo que `ponerContactoCliente`: esa valida
 * la ficha ENTERA, y un cliente del Excel a medio llenar rebotaría el guardado
 * por algo ajeno a la dirección que te acaban de dictar.
 */
export async function corregirDireccionCliente(
  datosCrudos: unknown,
): Promise<ResultadoContactoCliente> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("clientes", "editar");
  if (negado) return { ok: false, error: negado };

  const r = esquemaDireccion.safeParse(datosCrudos);
  if (!r.success) {
    return { ok: false, error: r.error.issues[0]?.message ?? "Los datos no son válidos." };
  }
  const datos = r.data;

  try {
    const supabase = await clienteServidor();

    // La razón social oficial no se cambia aquí, diga lo que diga el
    // navegador: la pantalla la enseña bloqueada, pero esto es un endpoint.
    let razonSocial: string | undefined;
    if (datos.razon_social !== undefined) {
      const { data: actual, error: errLectura } = await supabase
        .from("clientes")
        .select("tipo_documento, numero_documento, razon_social")
        .eq("id", datos.id)
        .maybeSingle();
      if (errLectura) return { ok: false, error: errLectura.message };
      if (!actual) return { ok: false, error: "El cliente no existe." };
      if (datos.razon_social !== actual.razon_social) {
        if (razonSocialEsOficial(actual.tipo_documento, actual.numero_documento)) {
          return {
            ok: false,
            error: "La razón social es la de SUNAT. Si hay que cambiarla, hazlo en la ficha del cliente.",
          };
        }
        razonSocial = datos.razon_social;
      }
    }

    // El distrito, igual que en la ficha: si no lo tenemos, se da de alta.
    let ubigeo: string | null = null;
    if (datos.ubigeo_codigo) {
      const { data: codigo } = await supabase.rpc("asegurar_ubigeo", {
        p_codigo: datos.ubigeo_codigo,
        p_departamento: datos.ubigeo_departamento ?? "",
        p_provincia: datos.ubigeo_provincia ?? "",
        p_distrito: datos.ubigeo_distrito ?? "",
      });
      ubigeo = (codigo as string | null) ?? null;
    }

    const { data, error } = await supabase
      .from("clientes")
      .update({
        direccion: datos.direccion,
        ubigeo_codigo: ubigeo,
        ...(razonSocial !== undefined ? { razon_social: razonSocial } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", datos.id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "El cliente no existe o no tienes permiso para editarlo." };

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${datos.id}`);
    revalidatePath("/cotizaciones", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la dirección.",
    };
  }
}
