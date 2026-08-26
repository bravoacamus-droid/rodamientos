import {
  IGV,
  importeConDescuento,
  redondear2,
  redondear4,
} from "@rodatech/config";

/**
 * Cálculo de totales de una cotización.
 *
 * Funciones puras: entra un objeto, sale un objeto. Sin React, sin Supabase,
 * sin fetch. Es lo que permite probarlo en milisegundos y sin base de datos.
 *
 * En la demo esto vivía dentro de un componente cliente de 974 líneas y no se
 * podía verificar sin montar React. Es justo el cálculo que SUNAT rechaza si
 * está mal, así que es el que más necesita pruebas.
 *
 * Regla de redondeo: se redondea en el importe de cada LÍNEA y después se
 * suman las líneas ya redondeadas. Si se sumara con todos los decimales y se
 * redondeara al final, el total del PDF no cuadraría con la suma de la
 * columna Importe que el cliente ve — y esa resta de céntimos es exactamente
 * la que hace que un comprobante sea observado.
 */

/** Una línea, con lo mínimo para calcular. */
export interface LineaCalculo {
  cantidad: number;
  valorUnitario: number;
  /** Porcentaje, de 0 a 100. */
  descuentoPct?: number;
  costoUnitario?: number;
}

export interface TotalesCotizacion {
  /** Suma de importes de línea, ya con descuento aplicado. */
  subtotal: number;
  /** Cuánto se descontó en total, frente al precio de lista. */
  descuentoTotal: number;
  igv: number;
  total: number;
  costoTotal: number;
  /** Margen sobre el subtotal, en porcentaje. */
  margenPct: number;
}

/**
 * Los redondeos viven en `@rodatech/config` desde que compras fue el tercer
 * módulo que los necesitó. Se reexportan para no tocar los doce sitios que ya
 * los importan desde aquí.
 */
export { redondear2, redondear4 };

/**
 * Importe de una línea: cantidad × valor unitario, menos el descuento.
 *
 * Réplica exacta de la columna generada `importe` de `cotizacion_items`:
 *
 *     round(cantidad * valor_unitario * (1 - descuento_pct / 100.0), 2)
 *
 * Se calcula con `importeConDescuento`, que hace la cuenta con enteros
 * grandes, y NO con `redondear2(cantidad × valor × factor)`. La diferencia es
 * de un céntimo y aparece en unas 14 de cada 200.000 líneas —medido, no
 * estimado—, siempre porque el producto en coma flotante cae justo por debajo
 * del medio céntimo y el redondeo lo tira para abajo.
 *
 * Poco, pero el efecto no es cosmético: el operador aprueba una cotización
 * viendo 9.651,25 y la base guarda 9.651,26. Lo guardado es coherente —los
 * dos números los calcula Postgres— pero lo que se enseñó antes de guardar
 * no era lo que se iba a guardar, y eso en un documento que el cliente firma
 * no vale.
 */
export function importeLinea(linea: LineaCalculo): number {
  return importeConDescuento(
    linea.cantidad,
    linea.valorUnitario,
    linea.descuentoPct ?? 0,
  );
}

/** Importe sin descuento, para saber cuánto se rebajó. */
export function importeSinDescuento(linea: LineaCalculo): number {
  return importeConDescuento(linea.cantidad, linea.valorUnitario, 0);
}

/** Totales de la cotización completa. */
export function calcularTotales(
  lineas: readonly LineaCalculo[],
): TotalesCotizacion {
  let subtotal = 0;
  let bruto = 0;
  let costoTotal = 0;

  for (const linea of lineas) {
    subtotal += importeLinea(linea);
    bruto += importeSinDescuento(linea);
    costoTotal += redondear2(linea.cantidad * (linea.costoUnitario ?? 0));
  }

  subtotal = redondear2(subtotal);
  bruto = redondear2(bruto);
  costoTotal = redondear2(costoTotal);

  const descuentoTotal = redondear2(bruto - subtotal);
  const igv = redondear2(subtotal * IGV);
  const total = redondear2(subtotal + igv);

  // El margen va sobre el COSTO, no sobre la venta.
  //
  // Willy, 26/08 (28:35): «lo que me interesa saber es el margen con respecto
  // al costo». Y es coherente con su plantilla, que calcula P.V. = P.C. × 1,20
  // exacto: él piensa en «le pongo 20 %». Con el denominador en la venta, un
  // costo de 10 vendido a 12 daba 16,7 % y él esperaba 20.
  //
  // El importe sigue siendo SIN IGV: el IGV no es ingreso, se recauda para
  // SUNAT, e incluirlo inflaría el número en 18 puntos.
  //
  // Con costo en cero se devuelve 0, no infinito. Un costo sin cargar es "no
  // se sabe", y mostrar un porcentaje enorme le diría al vendedor que está
  // haciendo un negocio redondo cuando en realidad no hay dato. Prefiere
  // callar antes que mentir; `margenLinea` hace lo mismo devolviendo null.
  const margenPct =
    subtotal > 0 && costoTotal > 0
      ? redondear2(((subtotal - costoTotal) / costoTotal) * 100)
      : 0;

  return { subtotal, descuentoTotal, igv, total, costoTotal, margenPct };
}

/**
 * Margen de una línea suelta, para pintarlo en vivo mientras se cotiza.
 *
 * Sobre el costo, como el total. Devuelve null si no hay costo: 0 % y "no se
 * sabe" no son lo mismo.
 */
export function margenLinea(linea: LineaCalculo): number | null {
  const costo = linea.costoUnitario ?? 0;
  if (costo <= 0) return null;

  const importe = importeLinea(linea);
  if (importe <= 0) return null;

  const costoLinea = redondear2(linea.cantidad * costo);
  if (costoLinea <= 0) return null;

  return redondear2(((importe - costoLinea) / costoLinea) * 100);
}

/**
 * Valor unitario que alcanza un margen objetivo, partiendo del costo.
 * Sirve para el botón de "aplicar margen" del constructor.
 *
 * Con el margen medido sobre el costo esto es una multiplicación, y de paso
 * arregla un desajuste que nadie había notado: `productos.margen_objetivo_pct`
 * arranca en 20 porque la plantilla de Willy hace P.V. = P.C. × 1,20, pero la
 * fórmula anterior —`costo / (1 − 20/100)`— devolvía costo × 1,25. O sea que
 * el botón de "aplicar margen" venía proponiendo precios un 4 % por encima de
 * los de su propio Excel.
 *
 * Ya no hace falta el tope de 100: un margen del 150 % sobre el costo es
 * perfectamente posible (costo 10 → 25) y antes era imposible de expresar.
 */
export function valorParaMargen(costo: number, margenPct: number): number {
  if (costo <= 0 || margenPct <= -100) return 0;
  return redondear4(costo * (1 + margenPct / 100));
}
