import { IGV } from "@rodatech/config";

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

/** Redondeo a 2 decimales, resistente al error binario de coma flotante. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Redondeo a 4 decimales, para valores unitarios. */
export function redondear4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * Importe de una línea: cantidad × valor unitario, menos el descuento.
 *
 * Réplica exacta de la columna generada `importe` de `cotizacion_items`. Si
 * las dos fórmulas se separan, el PDF y la base dirían cosas distintas.
 */
export function importeLinea(linea: LineaCalculo): number {
  const descuento = linea.descuentoPct ?? 0;
  return redondear2(
    linea.cantidad * linea.valorUnitario * (1 - descuento / 100),
  );
}

/** Importe sin descuento, para saber cuánto se rebajó. */
export function importeSinDescuento(linea: LineaCalculo): number {
  return redondear2(linea.cantidad * linea.valorUnitario);
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

  // El margen se mide contra el subtotal (sin IGV): el IGV no es ingreso, se
  // recauda para SUNAT. Incluirlo inflaría el margen en 18 puntos.
  //
  // Con costo en cero se devuelve 0, no 100. Un costo sin cargar es "no se
  // sabe", y mostrar 100 % de margen le diría al vendedor que está haciendo
  // un negocio redondo cuando en realidad no hay dato. Prefiere callar antes
  // que mentir; `margenLinea` hace lo mismo devolviendo null.
  const margenPct =
    subtotal > 0 && costoTotal > 0
      ? redondear2(((subtotal - costoTotal) / subtotal) * 100)
      : 0;

  return { subtotal, descuentoTotal, igv, total, costoTotal, margenPct };
}

/**
 * Margen de una línea suelta, para pintarlo en vivo mientras se cotiza.
 * Devuelve null si no hay costo: 0 % y "no se sabe" no son lo mismo.
 */
export function margenLinea(linea: LineaCalculo): number | null {
  const costo = linea.costoUnitario ?? 0;
  if (costo <= 0) return null;

  const importe = importeLinea(linea);
  if (importe <= 0) return null;

  const costoLinea = redondear2(linea.cantidad * costo);
  return redondear2(((importe - costoLinea) / importe) * 100);
}

/**
 * Valor unitario que alcanza un margen objetivo, partiendo del costo.
 * Sirve para el botón de "aplicar margen" del constructor.
 */
export function valorParaMargen(costo: number, margenPct: number): number {
  if (margenPct >= 100) return 0; // margen imposible: evita dividir por cero
  return redondear4(costo / (1 - margenPct / 100));
}
