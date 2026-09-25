import type { TipoCompra } from "./tipos";

/**
 * Los gastos de una compra, y las tres modalidades que los deciden.
 *
 * Willy, 24/09 (§AO.4): *«yo quiero registrar todos los gastos que he
 * incurrido para que me llegue esa mercadería acá, para así poder establecer
 * cuál es mi costo real puesto acá»*. Y cada modalidad lleva gastos distintos,
 * que es por lo que pidió separarlas.
 *
 * ---------------------------------------------------------------------------
 * Tres modalidades en pantalla, dos tipos en la base
 * ---------------------------------------------------------------------------
 * La base guarda `tipo` —local o importación— y, si es importación, la VÍA
 * (095). Es como lo dijo él (32:28): *«compra local, compra importación, y la
 * importación se subdivide en aéreo y marítimo»*. La pantalla junta las dos
 * cosas en un solo selector de tres, porque quien registra piensa en «esto
 * vino por avión», no en «tipo importación, vía aérea».
 */

export type Modalidad = "local" | "aerea" | "maritima";
export type ViaImportacion = "aerea" | "maritima";

export const MODALIDADES: readonly Modalidad[] = ["local", "aerea", "maritima"];

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  local: "Compra local",
  aerea: "Importación aérea",
  maritima: "Importación marítima",
};

/** Lo que distingue a cada una, en una frase y con sus palabras. */
export const AYUDA_MODALIDAD: Record<Modalidad, string> = {
  local: "A un proveedor de aquí, con su factura. Si pagaste transporte, apúntalo abajo.",
  aerea:
    "Le pagas a tu proveedor la mercadería y el courier juntos; el desaduanaje lo cobra el courier aparte.",
  maritima:
    "Flete, aduana, almacén, levante, traslado… Apunta cada gasto: todos entran al costo.",
};

/**
 * Los gastos que se proponen al elegir la modalidad.
 *
 * Son PROPUESTAS, no una lista cerrada: el concepto es texto libre en la base
 * (`gastos_importacion.concepto`) y se puede escribir otro o añadir filas.
 * Salen de la reunión del 24/09:
 *
 *   · Aérea (26:00): *«yo no pago el courier, yo pago a mi proveedor […] y él
 *     hace el pago al courier»* — por eso el courier va como gasto de la
 *     factura del proveedor, y el desaduanaje aparte, que es lo único que
 *     cobra DHL directamente.
 *   · Marítima (27:xx): *«hay que pagar los ajustes de valor, el almacén, el
 *     levante, el traslado…»*.
 */
export const CONCEPTOS_SUGERIDOS: Record<Modalidad, readonly string[]> = {
  local: ["Transporte"],
  aerea: ["Courier", "Desaduanaje"],
  maritima: [
    "Flete marítimo",
    "Derechos de aduana",
    "Ajuste de valor",
    "Almacenaje",
    "Levante",
    "Agente de aduanas",
    "Traslado al almacén",
  ],
};

/** El courier se elige de una lista que crece sola (ver `api/couriers`). */
export const COURIERS_DE_SIEMPRE: readonly string[] = ["DHL", "FedEx", "UPS"];

/** Un gasto tal como se edita en pantalla. */
export interface GastoEditable {
  key: string;
  concepto: string;
  monto: number;
}

export function modalidadDe(tipo: TipoCompra, via: ViaImportacion): Modalidad {
  return tipo === "local" ? "local" : via;
}

export function tipoYVia(m: Modalidad): { tipo: TipoCompra; via: ViaImportacion | null } {
  return m === "local" ? { tipo: "local", via: null } : { tipo: "importacion", via: m };
}

/** Redondeo a céntimos, sin la trampa de la coma flotante en las sumas. */
const centimos = (n: number) => Math.round(n * 100) / 100;

export function totalGastos(gastos: readonly GastoEditable[]): number {
  return centimos(gastos.reduce((a, g) => a + (g.monto > 0 ? g.monto : 0), 0));
}

/**
 * Lo que viaja a la base: solo las filas con concepto Y con dinero.
 *
 * Las propuestas vacías («Almacenaje», 0) están para que se vea qué suele
 * haber, no para guardar ceros: un gasto de cero en la ficha de la compra
 * diría que se pagó almacén y fue gratis, que no es lo mismo que no haberlo.
 */
export function gastosParaEnviar(
  gastos: readonly GastoEditable[],
): { concepto: string; monto: number }[] {
  return gastos
    .filter((g) => g.monto > 0 && g.concepto.trim() !== "")
    .map((g) => ({ concepto: g.concepto.trim(), monto: centimos(g.monto) }));
}

/** ¿Alguien ha escrito ya dinero en algún gasto? */
export function hayGastosEscritos(gastos: readonly GastoEditable[]): boolean {
  return gastos.some((g) => g.monto > 0);
}
