"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Eliminar un pedido (135). Las reglas viven en `eliminar_pedido`: solo el
 * último de su cotización y sin nada vivo colgando. Si era el único, la
 * cotización vuelve a «enviada».
 */
export async function eliminarPedido(
  id: string,
): Promise<{ ok: true; cotizacionId: string; numero: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("cotizaciones", "eliminar");
  if (negado) {
    return { ok: false, error: negado };
  }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Pedido no válido." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("eliminar_pedido", { p_id: id });
    if (error) return { ok: false, error: error.message };
    const r = data as { cotizacion_id: string; numero: string };
    revalidatePath("/pedidos");
    revalidatePath("/cotizaciones");
    revalidatePath(`/cotizaciones/${r.cotizacion_id}`);
    return { ok: true, cotizacionId: r.cotizacion_id, numero: r.numero };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo eliminar el pedido." };
  }
}
