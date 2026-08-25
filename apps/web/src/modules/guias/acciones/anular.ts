"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

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
const ROLES = ["gerencia", "admin"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  motivo: z
    .string()
    .trim()
    .min(5, "Explica en una frase por qué se anula.")
    .max(500),
});

export type ResultadoAnulacionGuia =
  | { ok: true; numero: string }
  | { ok: false; error: string };

export async function anularGuia(
  _previo: ResultadoAnulacionGuia | null,
  formData: FormData,
): Promise<ResultadoAnulacionGuia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Solo Gerencia puede anular una guía." };
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

    revalidatePath("/guias");
    revalidatePath(`/guias/${datos.id}`);
    // La mercadería vuelve al almacén: el catálogo y el inventario cambian.
    revalidatePath("/productos");
    revalidatePath("/inventario");
    revalidatePath("/reportes");

    return { ok: true, numero: String(r.numero ?? "") };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo anular la guía.",
    };
  }
}
