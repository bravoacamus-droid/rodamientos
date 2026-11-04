"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * «Usar el stock» en vez de comprar, desde el pedido (04/11).
 *
 * Luis: *«que tenga un botón que si tiene stock, utilice el stock, y salga
 * una validación: ¿seguro que quieres utilizar el stock? Se borrará la orden
 * de compra»*. La base (`usar_stock_en_vez_de_comprar`, 186) quita el
 * producto de las órdenes del pedido que no se compraron todavía, anula la
 * que se queda vacía y se niega si el stock no alcanza o si ya se compró.
 *
 * Toda Server Action es un endpoint público: rol y datos primero.
 */
const esquema = z.object({
  itemId: z.string().uuid(),
  pedidoId: z.string().uuid(),
  cotizacionId: z.string().uuid(),
});

export async function usarStockEnVezDeComprar(
  datosCrudos: unknown,
): Promise<{ ok: true; anuladas: string[]; quitadas: string[] } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("compras", "editar");
  if (negado) return { ok: false, error: negado };

  const datos = esquema.safeParse(datosCrudos);
  if (!datos.success) return { ok: false, error: "Los datos no son válidos." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("usar_stock_en_vez_de_comprar", { p_item: datos.data.itemId });
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/pedidos/${datos.data.pedidoId}`);
    revalidatePath(`/cotizaciones/${datos.data.cotizacionId}`);
    revalidatePath("/pedidos");
    revalidatePath("/compras");
    const r = data as unknown as { anuladas: string[] | null; quitadas: string[] | null };
    return { ok: true, anuladas: r.anuladas ?? [], quitadas: r.quitadas ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo usar el stock." };
  }
}
