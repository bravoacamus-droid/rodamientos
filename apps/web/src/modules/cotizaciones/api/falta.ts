import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { bandejaPorComprar, loQueFaltaDe, type FaltaDelPedido } from "@/modules/compras";

/**
 * Qué le falta a un pedido para poder despacharse entero.
 *
 * Envuelve la bandeja «Por comprar» y no cuenta por su cuenta, y eso es lo
 * único importante de este archivo: restar el stock línea a línea aquí sería
 * más corto y daría OTRO número, porque el stock se reparte entre todos los
 * pedidos que esperan el mismo producto, por orden de confirmación.
 *
 * Dos pantallas contestando lo mismo con cifras distintas es peor que una
 * pantalla de menos.
 *
 * Si la bandeja falla devuelve vacío: la ficha del pedido tiene que abrir
 * igual. Esto es un dato de apoyo, no el documento.
 */
export async function loQueFaltaDelPedido(
  cotizacionId: string,
): Promise<FaltaDelPedido[]> {
  const r = await bandejaPorComprar();
  if (!r.ok) return [];
  return loQueFaltaDe(cotizacionId, r.datos.filas);
}

/**
 * Cuánto ha salido ya con guía, por línea de la cotización.
 *
 * Hace falta para no mentir en la columna del almacén. Una línea que no falta
 * puede estar en dos situaciones muy distintas —la mercadería está en el
 * estante, o ya se la llevó el cliente— y llamar «En almacén» a la segunda
 * manda a alguien a buscar algo que salió la semana pasada.
 *
 * Solo cuenta las guías **emitidas**: el borrador no ha movido nada del
 * almacén y la anulada lo devolvió. Es el mismo criterio que la 074 usa en
 * `v_comprometido`, y tiene que serlo — si aquí se contara distinto, la
 * columna diría una cosa y el aviso de arriba otra.
 *
 * Vacío si falla: es una etiqueta de apoyo sobre una ficha que tiene que
 * abrir igual.
 */
export async function despachadoPorLinea(
  cotizacionId: string,
): Promise<Map<string, number>> {
  const salida = new Map<string, number>();

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("guia_items")
      .select("cotizacion_item_id, cantidad, guias_remision!inner(estado, cotizacion_id)")
      .eq("guias_remision.cotizacion_id", cotizacionId)
      .eq("guias_remision.estado", "emitida")
      .limit(500);

    if (error || !data) return salida;

    for (const f of data as unknown as {
      cotizacion_item_id: string | null;
      cantidad: number | string;
    }[]) {
      if (!f.cotizacion_item_id) continue;
      const n = Number(f.cantidad ?? 0);
      salida.set(
        f.cotizacion_item_id,
        (salida.get(f.cotizacion_item_id) ?? 0) + (Number.isFinite(n) ? n : 0),
      );
    }
  } catch {
    // Ver arriba: sin esto la ficha abre igual, solo con la etiqueta genérica.
  }

  return salida;
}
