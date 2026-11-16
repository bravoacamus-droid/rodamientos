/**
 * Cantidades con decimales SEGÚN LA UNIDAD (16/11).
 *
 * Willy, por Luis: *«algunos productos los puede vender 3.5 metros… él ya
 * sabe qué productos son, pero quiere la cantidad en decimales»*. Luis eligió
 * que lo decida la unidad del producto: lo que se MIDE (metro, kilo, galón,
 * hora) o se cuenta por grupos (docena, ciento, millar) admite dos decimales;
 * lo que se cuenta por pieza (unidad, kit, caja, juego, par) sigue entero. Así
 * no se puede teclear «3.5 rodamientos» por error, y un producto que se vende
 * en fracciones se arregla poniéndole su unidad en la ficha.
 *
 * Dos decimales porque es lo que guarda la base (`numeric(14,2)` en todas las
 * cantidades) y lo que se ve en el papel. SUNAT admite hasta diez.
 *
 * La MISMA lista está en la base (`unidad_admite_decimales`, 200): si se toca
 * una, se toca la otra.
 */
export const UNIDADES_CON_DECIMALES: ReadonlySet<string> = new Set([
  // Longitud
  "MTR", "CMT", "MMT", "INH", "FOT", "YRD",
  // Superficie y volumen
  "MTK", "MTQ", "LTR", "MLT", "GLL",
  // Peso
  "KGM", "GRM", "TNE", "LBR", "ONZ",
  // Tiempo (servicios por horas o días)
  "HUR", "DAY", "MON", "ANN",
  // Grupos: media docena, 0.25 de ciento (ya pasó en SIMPLE)
  "DZN", "GRO", "CEN", "MIL",
]);

/** ¿Esta unidad admite decimales? Sin unidad, se trata como pieza. */
export function admiteDecimales(unidad: string | null | undefined): boolean {
  return UNIDADES_CON_DECIMALES.has(String(unidad ?? "").trim().toUpperCase());
}

/** El `step` del campo: 0.01 si admite decimales, 1 si no. */
export function pasoCantidad(unidad: string | null | undefined): number {
  return admiteDecimales(unidad) ? 0.01 : 1;
}

/**
 * Lo que se tecleó, ya como cantidad válida para esa unidad: dos decimales o
 * entero, y nunca negativa ni NaN. Es lo que los campos guardan en su estado.
 */
export function ajustarCantidad(valor: number, unidad: string | null | undefined): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return admiteDecimales(unidad) ? Math.round(valor * 100) / 100 : Math.round(valor);
}

/** ¿Es una cantidad que esa unidad acepta tal cual? (para validar en el servidor) */
export function cantidadValidaPara(valor: number, unidad: string | null | undefined): boolean {
  if (!Number.isFinite(valor)) return false;
  return admiteDecimales(unidad)
    ? Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6
    : Number.isInteger(valor);
}

/** La frase cuando no: con el código y la salida. */
export function mensajeCantidadEntera(codigo: string, cantidad: number): string {
  return `${codigo} se vende por pieza: la cantidad tiene que ser entera (llegó ${cantidad}). Si se vende por metro, kilo u otra medida, cambia su unidad en la ficha del producto.`;
}
