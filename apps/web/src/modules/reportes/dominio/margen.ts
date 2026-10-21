/**
 * El margen de lo facturado, o por qué no se puede dar (auditoría, 21/10).
 *
 * Informes › Lo facturado decía «costo $ 35.39 · margen 373875.61 % sobre el
 * costo»: casi ninguna venta tiene costo —el histórico entró sin él—, así que
 * se dividía lo vendido entre el costo de dos o tres líneas. Un número así no
 * es un margen, es un aviso de que falta el costo.
 *
 * La serie trae el total vendido y el total de costo, no qué líneas tienen
 * costo, así que la cobertura se estima: si el costo no llega al 20 % de lo
 * vendido —un margen por encima del 400 % sobre el costo, que en rodamientos
 * no existe—, es que falta el costo en la mayoría de las ventas.
 */
export type MargenFacturado =
  | { tipo: "sin_costo" }
  | { tipo: "incompleto" }
  | { tipo: "ok"; pct: number };

/** Por debajo de esta parte de lo vendido, el costo se da por incompleto. */
export const COSTO_MINIMO_CREIBLE = 0.2;

export function margenDeLoFacturado(venta: number, costo: number): MargenFacturado {
  if (!(costo > 0)) return { tipo: "sin_costo" };
  if (venta > 0 && costo < venta * COSTO_MINIMO_CREIBLE) return { tipo: "incompleto" };
  // Sobre el COSTO, como en todo el ERP (023).
  return { tipo: "ok", pct: ((venta - costo) / costo) * 100 };
}
