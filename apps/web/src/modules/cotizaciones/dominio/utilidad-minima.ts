/**
 * La utilidad mínima de una cotización (189).
 *
 * Willy, 04/11 (31:01): *«si son 100 dólares, 20 dólares como mínimo; si es
 * más, aumenta la utilidad»*. Crece con la venta: el mayor de un piso en
 * dólares y un porcentaje de la venta sin IGV. Las dos cifras salen de
 * «Datos de la empresa».
 *
 * Es un aviso, no un bloqueo: Willy lo quiere ver al cotizar «para ver si
 * puedo subir o bajar los precios».
 */

export interface ReglaUtilidad {
  /** El piso, en USD. */
  minimoUsd: number;
  /** Porcentaje de la venta sin IGV. */
  porcentaje: number;
}

/** La de Willy, por si la empresa no se pudo leer. */
export const REGLA_UTILIDAD_POR_DEFECTO: ReglaUtilidad = { minimoUsd: 20, porcentaje: 20 };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function utilidadMinima(ventaSinIgv: number, regla: ReglaUtilidad): number {
  return r2(Math.max(regla.minimoUsd, (Math.max(ventaSinIgv, 0) * regla.porcentaje) / 100));
}

export interface EstadoUtilidad {
  utilidad: number;
  minima: number;
  /** Lo que falta para llegar al mínimo; 0 si ya llega. */
  falta: number;
  llega: boolean;
}

/**
 * Null cuando no hay costo: sin costo la utilidad sería la venta entera, y
 * decir «llega al mínimo» con eso sería mentir.
 */
export function estadoUtilidad(
  ventaSinIgv: number,
  costo: number,
  regla: ReglaUtilidad,
): EstadoUtilidad | null {
  if (!(costo > 0) || !(ventaSinIgv > 0)) return null;
  const utilidad = r2(ventaSinIgv - costo);
  const minima = utilidadMinima(ventaSinIgv, regla);
  const falta = r2(Math.max(minima - utilidad, 0));
  return { utilidad, minima, falta, llega: falta === 0 };
}
