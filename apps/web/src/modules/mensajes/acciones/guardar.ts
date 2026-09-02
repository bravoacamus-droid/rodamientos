"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { TOPE_PLANTILLA } from "../dominio/plantillas";

/**
 * Guardar y dar de baja plantillas de mensaje.
 *
 * Las reglas de contenido —qué variables existen, si falta la firma— viven en
 * `dominio/plantillas.ts` y se enseñan mientras se escribe. Aquí solo va lo
 * que no puede depender del navegador: el rol y los límites que la base
 * también impone.
 */

/** La misma lista que `permisos_rol` tiene para `plantillas_mensaje`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export type ResultadoPlantilla =
  | { ok: true; id: string }
  | { ok: false; error: string };

const esquema = z.object({
  id: z.string().uuid().nullable(),
  nombre: z.string().trim().min(1, "Ponle un nombre.").max(80),
  uso: z.enum(["pedido_precio", "cotizacion", "cobranza", "general"]),
  canal: z.enum(["whatsapp", "correo"]),
  asunto: z.string().trim().max(200).nullable(),
  cuerpo: z
    .string()
    .trim()
    .min(1, "El mensaje está vacío.")
    .max(TOPE_PLANTILLA, `El mensaje no puede pasar de ${TOPE_PLANTILLA} caracteres.`),
  predeterminada: z.boolean(),
  activa: z.boolean(),
});

async function noPuede(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede editar los mensajes.";
  }
  return null;
}

export async function guardarPlantilla(
  _previo: ResultadoPlantilla | null,
  formData: FormData,
): Promise<ResultadoPlantilla> {
  const veto = await noPuede();
  if (veto) return { ok: false, error: veto };

  const crudo = formData.get("plantilla");
  if (typeof crudo !== "string") return { ok: false, error: "No llegaron los datos." };

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  // Un asunto en una plantilla de WhatsApp no tiene dónde salir, y la base lo
  // rechaza con un `check`. Se limpia aquí para que cambiar el canal en la
  // pantalla no falle por un campo que ya no se ve.
  const asunto = datos.canal === "correo" ? (datos.asunto || null) : null;

  try {
    const supabase = await clienteServidor();

    // Solo puede haber una predeterminada por uso y canal —lo garantiza un
    // índice único— así que se quita la anterior ANTES de poner la nueva. Sin
    // esto el índice rechaza el guardado y la persona no entiende por qué.
    if (datos.predeterminada && datos.activa) {
      const previa = supabase
        .from("plantillas_mensaje")
        .update({ predeterminada: false })
        .eq("uso", datos.uso)
        .eq("canal", datos.canal)
        .eq("predeterminada", true);
      const { error } = datos.id ? await previa.neq("id", datos.id) : await previa;
      if (error) return { ok: false, error: error.message };
    }

    const campos = {
      nombre: datos.nombre,
      uso: datos.uso,
      canal: datos.canal,
      asunto,
      cuerpo: datos.cuerpo,
      predeterminada: datos.predeterminada && datos.activa,
      activa: datos.activa,
      actualizado_en: new Date().toISOString(),
    };

    if (datos.id) {
      const { error } = await supabase
        .from("plantillas_mensaje")
        .update(campos)
        .eq("id", datos.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/configuracion");
      return { ok: true, id: datos.id };
    }

    const perfil = await perfilActual();
    const { data, error } = await supabase
      .from("plantillas_mensaje")
      .insert({ ...campos, creado_por: perfil?.id ?? null })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath("/configuracion");
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el mensaje.",
    };
  }
}

/**
 * Dar de baja, no borrar.
 *
 * Una plantilla que se borra se lleva por delante el texto que alguien tardó
 * en redactar, y el borrado es el único botón que no tiene deshacer. Dada de
 * baja deja de ofrecerse al mandar y se puede reactivar.
 */
export async function darDeBajaPlantilla(id: string): Promise<ResultadoPlantilla> {
  const veto = await noPuede();
  if (veto) return { ok: false, error: veto };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Identificador inválido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("plantillas_mensaje")
      // Deja de ser la predeterminada al darla de baja: si no, el índice único
      // seguiría ocupado por una plantilla que ya nadie puede usar y no se
      // podría marcar otra.
      .update({ activa: false, predeterminada: false, actualizado_en: new Date().toISOString() })
      .eq("id", id);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/configuracion");
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo dar de baja.",
    };
  }
}
