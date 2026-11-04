"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Anular un pedido (188; hasta la 135 se borraba). Las reglas viven en
 * `anular_pedido`: solo el último de su cotización y sin nada vivo colgando.
 * Si era el único, la cotización vuelve a «enviada». El pedido se queda en
 * la lista, anulado y con su motivo.
 *
 * Luis, 04/11: *«tiene que quedar… sería anular el pedido, para que quede
 * ahí registro»*.
 */
const esquema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(3, "Di por qué se anula el pedido.").max(300),
});

export async function anularPedido(
  datosCrudos: unknown,
): Promise<{ ok: true; cotizacionId: string; numero: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("cotizaciones", "eliminar");
  if (negado) {
    return { ok: false, error: negado };
  }
  const datos = esquema.safeParse(datosCrudos);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? "Los datos no son válidos." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("anular_pedido", { p_id: datos.data.id, p_motivo: datos.data.motivo });
    if (error) return { ok: false, error: error.message };
    const r = data as { cotizacion_id: string; numero: string };
    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${datos.data.id}`);
    revalidatePath("/cotizaciones");
    revalidatePath(`/cotizaciones/${r.cotizacion_id}`);
    return { ok: true, cotizacionId: r.cotizacion_id, numero: r.numero };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo anular el pedido." };
  }
}
