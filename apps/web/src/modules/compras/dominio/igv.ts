/**
 * El IGV de una compra.
 *
 * ---------------------------------------------------------------------------
 * Qué significa aquí «afecto»
 * ---------------------------------------------------------------------------
 * No es una propiedad del producto ni de la moneda: es si el comprobante que
 * va a emitir ESE proveedor lleva IGV. Luis, 09/09: *«supuestamente, como yo
 * estoy comprando, viene o no con IGV, ¿no? Él me dirá»*.
 *
 * Hasta el 09/09 se deducía del tipo de proveedor —local con IGV, importación
 * sin—. Acierta casi siempre y falla en un caso corriente en Lima: el
 * proveedor local que emite boleta o está en el RUS. A su compra se le sumaba
 * un 18 % que no existe, y ese 18 % viaja al costo y de ahí al margen de todo
 * lo que se venda de ese lote.
 *
 * El número vive aquí y no repartido por la pantalla porque el día que la tasa
 * cambie —ya pasó en Perú— hay que cambiarlo en un sitio. La base tiene el
 * suyo en `crear_compra` (016), que es el que manda: esto solo enseña el total
 * antes de guardar.
 */

/** 18 %, la general. La base usa la misma en `crear_compra` (016). */
export const TASA_IGV = 0.18;

/** Redondeo a céntimo, el mismo criterio que el resto de compras. */
function dos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Lo que se paga con el IGV encima. */
export function conIgv(subtotal: number, tasa = TASA_IGV): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return dos(subtotal * (1 + tasa));
}

/** El IGV solo, que es lo que se enseña al lado del subtotal. */
export function soloIgv(subtotal: number, tasa = TASA_IGV): number {
  return dos(conIgv(subtotal, tasa) - dos(subtotal));
}
