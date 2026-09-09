/**
 * Qué se puede decir del margen, según cuánto costo se conozca.
 *
 * ---------------------------------------------------------------------------
 * El fallo que esto existe para evitar
 * ---------------------------------------------------------------------------
 * El 04/09 el tablero enseñaba, sobre el histórico entero:
 *
 *     VENDIDO   USD 201,797
 *     MARGEN    USD 201,797   ·   0.0% sobre el costo
 *
 * El margen era la venta entera —o sea, ganancia del 100 %— y su propia
 * explicación lo desmentía en la línea de abajo. Las dos cifras salían de la
 * misma cuenta, `venta - costo`, con los 479 comprobantes del histórico a
 * `costo_total = 0`.
 *
 * ---------------------------------------------------------------------------
 * Y el caso mixto es el PERMANENTE, no uno de paso
 * ---------------------------------------------------------------------------
 * Lo primero que se piensa es que se arregla solo cuando Willy empiece a
 * facturar de verdad. No: esos 479 documentos vinieron de su sistema anterior
 * sin costo y **nunca lo van a tener**. Cualquier rango que mire hacia atrás
 * —«Este año», «Todo»— mezclará ventas con costo y sin él mientras el ERP
 * exista.
 *
 * Por eso no basta con «si no hay costo, no digas nada»: hay que decir sobre
 * qué parte de la venta se calcula el margen.
 */

/**
 * A partir de aquí el margen no es un margen: es un costo mal cargado.
 *
 * El 09/09 el tablero decía **«USD 31 · 15325.0% sobre el costo»** con una
 * sola factura. El comprobante era real y la cuenta correcta: se vendió a
 * 30.85 un producto cuyo `costo_unitario` estaba en **0.20**. Un rodamiento
 * SKF que se vende a treinta dólares no cuesta veinte céntimos.
 *
 * Y no es un caso raro que se arregle solo: de 790 productos, la mayoría no
 * tiene costo y varios lo tienen residual de la carga del Excel. Cada vez que
 * uno de esos entre en una venta, esta tarjeta dará una cifra imposible.
 *
 * 300 % porque en distribución de repuestos no existe. La plantilla de
 * productos trae 20 % de objetivo; 100 % ya sería extraordinario. Por encima
 * de 300 lo que informa el número no es cuánto se ganó, sino que hay un costo
 * que revisar — y eso es lo que tiene que decir la pantalla.
 *
 * El umbral es generoso a propósito: es preferible enseñar un margen alto de
 * verdad a callar uno bueno. Lo que se corta es lo absurdo.
 */
export const PCT_IMPOSIBLE = 300;

export type EstadoMargen =
  /** Ninguna venta del periodo trae costo. No hay margen que dar. */
  | { tipo: "sin_costo" }
  /**
   * Hay costo, pero da un margen imposible. No se enseña la cifra: se dice
   * que el costo está mal, que es lo único cierto y lo único accionable.
   */
  | { tipo: "costo_dudoso"; pct: number }
  /** Todas lo traen. El margen habla de la venta entera. */
  | { tipo: "completo"; margen: number; pct: number }
  /** Solo una parte. El margen habla de esa parte, y hay que decirlo. */
  | { tipo: "parcial"; margen: number; pct: number; cubrePct: number };

/**
 * @param ventaNeta      Toda la venta del periodo.
 * @param ventaConCosto  La de los documentos cuyo costo se conoce.
 * @param costo          El costo de esos documentos.
 */
export function estadoDelMargen(
  ventaNeta: number,
  ventaConCosto: number,
  costo: number,
): EstadoMargen {
  if (ventaConCosto <= 0 || costo <= 0) return { tipo: "sin_costo" };

  const margen = redondear(ventaConCosto - costo);
  const pct = redondear(((ventaConCosto - costo) / costo) * 100);

  // Antes que nada: si la cifra es imposible, el costo está mal y decir el
  // porcentaje sería dar por bueno un dato que no lo es. Va delante del caso
  // parcial porque un costo falso lo estropea igual cubra el 10 % o el 100 %
  // de la venta.
  if (pct > PCT_IMPOSIBLE) return { tipo: "costo_dudoso", pct };

  // Un céntimo de diferencia no merece una frase: puede venir del redondeo de
  // dos sumas distintas, no de una venta sin costo.
  if (ventaNeta - ventaConCosto <= 0.01) {
    return { tipo: "completo", margen, pct };
  }

  return {
    tipo: "parcial",
    margen,
    pct,
    cubrePct: Math.round((ventaConCosto / ventaNeta) * 100),
  };
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
