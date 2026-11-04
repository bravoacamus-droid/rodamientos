"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Anula una guía y **devuelve al almacén lo que sacó**.
 *
 * Solo gerencia: `anular_guia()` exige `es_gerencia()`, y tiene sentido —
 * anular una guía es un movimiento de stock en sentido contrario, no una
 * corrección de un dato.
 *
 * La función se niega si hay un comprobante vigente que la referencia. Es lo
 * correcto: si ya se facturó contra esa guía, deshacerla dejaría la factura
 * apuntando a un documento anulado. Primero se anula el comprobante.
 */

/** Solo gerencia y admin, que es lo que exige `es_gerencia()`. */
const esquema = z.object({
  id: z.string().uuid(),
  motivo: z
    .string()
    .trim()
    .min(5, "Explica en una frase por qué se anula.")
    .max(500),
});

export type ResultadoAnulacionGuia =
  /** `pideBaja`: SUNAT la había aceptado y falta darla de baja allí (190). */
  | { ok: true; numero: string; pideBaja: boolean }
  | { ok: false; error: string };

export async function anularGuia(
  _previo: ResultadoAnulacionGuia | null,
  formData: FormData,
): Promise<ResultadoAnulacionGuia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("guias", "eliminar");
  if (negado) {
    return { ok: false, error: negado };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({ id: formData.get("id"), motivo: formData.get("motivo") });
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("anular_guia", {
      p_id: datos.id,
      p_motivo: datos.motivo,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { numero: string };
    // ¿Quedó esperando la baja en SUNAT? Lo decide `anular_guia` (190).
    const { data: tras } = await supabase
      .from("guias_remision")
      .select("estado_sunat")
      .eq("id", datos.id)
      .maybeSingle();

    revalidatePath("/guias");
    revalidatePath(`/guias/${datos.id}`);
    // La mercadería vuelve al almacén: el catálogo y el inventario cambian.
    revalidatePath("/productos");
    revalidatePath("/inventario");
    revalidatePath("/reportes");

    return {
      ok: true,
      numero: String(r.numero ?? ""),
      pideBaja: tras?.estado_sunat === "baja_solicitada",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo anular la guía.",
    };
  }
}

const esquemaBaja = z.object({
  id: z.string().uuid(),
  nota: z.string().trim().max(200).optional().default(""),
});

/**
 * Apunta que la guía anulada ya se dio de baja en SUNAT Operaciones en Línea
 * (190). Lo hace una persona: para la guía electrónica no hay baja por
 * servicio. El mismo permiso que anularla, y la base lo vuelve a mirar.
 */
export async function marcarBajaSunat(
  entrada: z.input<typeof esquemaBaja>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("guias", "eliminar");
  if (negado) return { ok: false, error: negado };

  const datos = esquemaBaja.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? "Los datos no son válidos." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("marcar_baja_guia_sunat", {
      p_id: datos.data.id,
      p_nota: datos.data.nota || undefined,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/guias");
    revalidatePath(`/guias/${datos.data.id}`);
    revalidatePath("/sunat");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
