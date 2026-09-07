"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Dar de alta una agencia de transporte sin salir de la guía.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale
 * ---------------------------------------------------------------------------
 * Luis: *«en guía falta poner en agencia un botón que abra un modal para
 * registrar una nueva agencia»*.
 *
 * La tabla existe desde la 029 —con sus permisos, su RLS y las tres de
 * siempre— pero **nunca se hizo la puerta para añadir una cuarta**. El
 * desplegable solo sabía ofrecer lo que ya estaba: al cliente que manda por
 * una agencia nueva había que teclearle el RUC y la razón social a mano cada
 * vez, y no quedaba apuntada para la siguiente.
 *
 * Y como la guía se está preparando en ese momento, mandar a otra pantalla a
 * darla de alta pierde lo que se lleva escrito. Es el mismo caso del teléfono
 * del proveedor en «Pedir precio», y se resuelve igual: un diálogo.
 *
 * ---------------------------------------------------------------------------
 * Lo que devuelve
 * ---------------------------------------------------------------------------
 * La agencia entera, no un `ok` a secas. La lista del desplegable llega como
 * prop desde el servidor y **no se vuelve a leer** al guardar: sin devolverla,
 * la agencia recién creada existiría en la base y no en la pantalla que acaba
 * de crearla.
 */

/** Los mismos roles que la 029 le dio a `agencias_transporte`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

export interface AgenciaCreada {
  id: string;
  razon_social: string;
  nombre_corto: string | null;
  numero_documento: string | null;
}

const esquema = z.object({
  razon_social: z.string().trim().min(3, "Falta la razón social.").max(200),
  nombre_corto: z.string().trim().max(60).nullable().default(null),
  // Opcional a propósito: hay agencias chicas de provincia que se conocen por
  // el nombre y de las que nadie tiene el RUC a mano. Sin él la guía no se
  // puede EMITIR, pero sí preparar — y eso ya lo avisa el constructor.
  numero_documento: z.string().trim().nullable().default(null),
  telefono: z.string().trim().max(40).nullable().default(null),
  direccion: z.string().trim().max(200).nullable().default(null),
});

export type ResultadoAgencia =
  | { ok: true; agencia: AgenciaCreada; yaExistia: boolean }
  | { ok: false; error: string };

const limpio = (v: string | null) => (v === null || v.trim() === "" ? null : v.trim());

export async function registrarAgencia(datosCrudos: unknown): Promise<ResultadoAgencia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede dar de alta agencias." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(datosCrudos);
  } catch (e) {
    const primero = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: primero ?? "Los datos de la agencia no son válidos." };
  }

  const ruc = limpio(datos.numero_documento);
  // La 029 tiene un `check` de once dígitos. Comprobarlo aquí para poder
  // decirlo con palabras, en vez de devolver el texto del constraint.
  if (ruc !== null && !/^[0-9]{11}$/.test(ruc)) {
    return { ok: false, error: "El RUC son once dígitos, o déjalo vacío." };
  }

  const razon = datos.razon_social.trim();

  try {
    const supabase = await clienteServidor();

    /*
      Antes de insertar, mirar si ya está.

      La 029 tiene dos índices únicos —el RUC y el nombre normalizado— así que
      un duplicado reventaría igualmente, pero con un mensaje de Postgres que
      no le dice nada a nadie. Y el caso normal no es un error: la agencia
      estaba dada de baja, o alguien la creó ayer. En los dos, lo útil es
      devolverla y que el desplegable la elija.
    */
    const { data: existentes, error: errorBusca } = await supabase
      .from("agencias_transporte")
      .select("id, razon_social, nombre_corto, numero_documento, activo")
      .or(
        ruc === null
          ? `razon_social.ilike.${razon}`
          : `numero_documento.eq.${ruc},razon_social.ilike.${razon}`,
      )
      .limit(1);

    if (errorBusca) return { ok: false, error: errorBusca.message };

    const yaEsta = existentes?.[0];
    if (yaEsta) {
      // Se DESACTIVAN, no se borran (029): una guía vieja tiene que poder
      // seguir citando la suya. Volver a darla de alta es reactivarla.
      if (yaEsta.activo === false) {
        const { error } = await supabase
          .from("agencias_transporte")
          .update({ activo: true })
          .eq("id", yaEsta.id);
        if (error) return { ok: false, error: error.message };
      }

      revalidatePath("/guias/nueva");
      return {
        ok: true,
        yaExistia: true,
        agencia: {
          id: String(yaEsta.id),
          razon_social: String(yaEsta.razon_social),
          nombre_corto: (yaEsta.nombre_corto as string | null) ?? null,
          numero_documento: (yaEsta.numero_documento as string | null) ?? null,
        },
      };
    }

    const { data, error } = await supabase
      .from("agencias_transporte")
      .insert({
        razon_social: razon,
        nombre_corto: limpio(datos.nombre_corto),
        numero_documento: ruc,
        telefono: limpio(datos.telefono),
        direccion: limpio(datos.direccion),
      })
      .select("id, razon_social, nombre_corto, numero_documento")
      .single();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "La agencia no se llegó a guardar." };

    revalidatePath("/guias/nueva");
    return {
      ok: true,
      yaExistia: false,
      agencia: {
        id: String(data.id),
        razon_social: String(data.razon_social),
        nombre_corto: (data.nombre_corto as string | null) ?? null,
        numero_documento: (data.numero_documento as string | null) ?? null,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la agencia.",
    };
  }
}
