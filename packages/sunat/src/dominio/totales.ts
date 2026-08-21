/**
 * Desglose de un documento cuyos precios YA incluyen el IGV.
 *
 * Vive en el conector y no en una app porque las dos lo necesitan: el panel para
 * pintar el pie de la cotización mientras se teclea, y la tienda para el papel que
 * ve el cliente con el enlace público. Cuando esta cuenta estaba escrita dos veces,
 * bastaba tocar una para que el mismo documento mostrara dos totales distintos
 * según por dónde se mirara.
 *
 * En Rodatech el precio guardado es el que paga el cliente: de 118 salen 100 de base y
 * 18 de impuesto. Multiplicar por 0,18 un precio que ya lo lleva dentro cobra el
 * IGV dos veces, y no se nota hasta que el comprobante no cuadra con lo cobrado.
 */

export function redondear2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type LineaImporte = { quantity: number; unit_price: number };

export type TotalesDocumento = {
  /** Suma de las líneas, antes del descuento. */
  subtotal: number;
  /** Descuento efectivamente aplicado: nunca negativo ni mayor que el subtotal. */
  descuento: number;
  /** Lo que paga el cliente: subtotal − descuento. */
  total: number;
  /** Base imponible, obtenida dividiendo el total. */
  gravado: number;
  /** Impuesto, por resta, para que base + IGV sea EXACTAMENTE el total. */
  igv: number;
  /** Tasa usada, para poder rotularla («IGV 18%»). */
  tasa: number;
};

/**
 * Totales de un documento comercial con descuento en la cabecera.
 *
 * El descuento se recorta al subtotal: un cero de más al teclear no puede dejar el
 * documento en negativo. La función de la base lo rechaza igual (0119), pero aquí
 * se ve antes de intentar guardarlo.
 *
 * El IGV se calcula sobre el total YA descontado: rebajar el precio también rebaja
 * el impuesto, porque el impuesto se paga sobre lo que se cobra.
 */
export function totalesDocumento(
  lineas: LineaImporte[],
  opciones: { descuento?: number; tasaIgv?: number } = {},
): TotalesDocumento {
  const tasa = Number(opciones.tasaIgv ?? 18);
  const subtotal = redondear2(
    lineas.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      0,
    ),
  );
  const descuento = redondear2(
    Math.min(Math.max(Number(opciones.descuento) || 0, 0), subtotal),
  );
  const total = redondear2(subtotal - descuento);
  const gravado = redondear2(total / (1 + tasa / 100));
  return { subtotal, descuento, total, gravado, igv: redondear2(total - gravado), tasa };
}

/**
 * Igual que `totalesDocumento`, pero partiendo de un total ya guardado.
 *
 * Es lo que necesitan las pantallas que LEEN un documento: ahí el total y el
 * descuento vienen de la base y no hay que volver a sumar las líneas —si se
 * sumaran, un céntimo de diferencia en el redondeo haría que la ficha mostrara un
 * total distinto al que se le enseñó al cliente.
 */
export function totalesGuardados(
  total: number,
  descuento: number | null | undefined = 0,
  tasaIgv = 18,
): TotalesDocumento {
  const tasa = Number(tasaIgv ?? 18);
  const pagado = redondear2(total);
  const rebaja = redondear2(Math.max(Number(descuento) || 0, 0));
  const gravado = redondear2(pagado / (1 + tasa / 100));
  return {
    subtotal: redondear2(pagado + rebaja),
    descuento: rebaja,
    total: pagado,
    gravado,
    igv: redondear2(pagado - gravado),
    tasa,
  };
}
