"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Anulación de una compra.
 *
 * `anular_compra()` se niega si ya entró mercadería, y es lo correcto: anularla
 * dejaría el kardex apuntando a un documento que dice que nunca existió,
 * mientras el stock sigue en la estantería. Deshacer una entrada es un ajuste
 * de inventario, con su motivo y su responsable.
 *
 * El motivo es obligatorio. Un documento anulado sin motivo es un agujero en
 * la auditoría: dentro de seis meses nadie recuerda si fue un error de tecleo
 * o que el proveedor no sirvió.
 */

const ROLES = ["gerencia", "admin", "compras"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  motivo: z
    .string()
    .trim()
    .min(5, "Explica en una frase por qué se anula.")
    .max(500),
});

export type ResultadoAnulacion =
  | { ok: true; numero: string }
  | { ok: false; error: string };

export async function anularCompra(
  _previo: ResultadoAnulacion | null,
  formData: FormData,
): Promise<ResultadoAnulacion> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede anular compras." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({
      id: formData.get("id"),
      motivo: formData.get("motivo"),
    });
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("anular_compra", {
      p_id: datos.id,
      p_motivo: datos.motivo,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { numero: string };

    revalidatePath("/compras");
    revalidatePath(`/compras/${datos.id}`);
    revalidatePath("/recepciones/nueva");

    return { ok: true, numero: String(r.numero) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo anular la compra.",
    };
  }
}
