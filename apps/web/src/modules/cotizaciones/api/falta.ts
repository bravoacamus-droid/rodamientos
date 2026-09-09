import "server-only";

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
