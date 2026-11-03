/**
 * En qué situación está cada factura, y en qué orden se ven (03/11).
 *
 * Willy, al revisar Cobranzas: *«veo que salen ordenadas por días de
 * vencimiento mientras que el número de factura sale disperso, es preferible
 * que las facturas salgan ordenadas por correlativo para llevar un mejor
 * control resaltando con letras rojas las que ya vencieron»*, y que en
 * «Mostrar» *«siempre debe haber la opción de ver el total de facturas entre
 * pagadas, vencidas y por vencer»*.
 *
 * Una sola regla para la pantalla, el Excel y el estado de cuenta: si cada
 * uno decidiera «vencida» a su manera, el papel que se le manda al cliente
 * y la lista de quien cobra dirían cosas distintas. La misma que `v_cartera`:
 * vencida es la que debe algo y su vencimiento ya pasó (hoy no cuenta).
 *
 * Puro: la fecha de hoy entra como argumento.
 */

import type { TramoAging } from "./tipos";

export type Situacion = "pagada" | "vencida" | "por_vencer" | "sin_vencimiento";

export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  pagada: "Pagada",
  vencida: "Vencida",
  por_vencer: "Por vencer",
  sin_vencimiento: "Sin vencimiento",
};

/** Días entre dos fechas AAAA-MM-DD (b − a), sin horas ni zonas. */
function diasEntre(a: string, b: string): number {
  const ms =
    Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** Días de atraso al día de hoy, como `v_cartera`: nunca negativo. */
export function diasDeAtraso(vencimiento: string | null, hoy: string): number {
  if (!vencimiento) return 0;
  return Math.max(0, diasEntre(vencimiento.slice(0, 10), hoy));
}

/** El tramo de antigüedad, con los mismos cortes que `v_cartera`. */
export function tramoDe(vencimiento: string | null, hoy: string): TramoAging {
  if (!vencimiento) return "sin_vencimiento";
  const dias = diasEntre(vencimiento.slice(0, 10), hoy);
  if (dias <= 0) return "por_vencer";
  if (dias <= 30) return "1_30";
  if (dias <= 60) return "31_60";
  if (dias <= 90) return "61_90";
  return "mas_90";
}

export function situacionDe(d: { saldo: number; fecha_vencimiento: string | null }, hoy: string): Situacion {
  if (!(d.saldo > 0)) return "pagada";
  if (!d.fecha_vencimiento) return "sin_vencimiento";
  return diasDeAtraso(d.fecha_vencimiento, hoy) > 0 ? "vencida" : "por_vencer";
}

export interface TotalSituacion {
  facturas: number;
  /** En dólares, que es en lo que suma la base (116). */
  monto: number;
}

export type ResumenSituacion = Record<Situacion, TotalSituacion> & { todas: TotalSituacion };

/**
 * Cuántas y cuánto hay en cada situación. Lo pagado suma el TOTAL de la
 * factura; lo vencido y lo por vencer, lo que falta (el saldo).
 */
export function resumirSituacion(
  docs: readonly { total: number; saldo: number; fecha_vencimiento: string | null }[],
  hoy: string,
): ResumenSituacion {
  const vacio = (): TotalSituacion => ({ facturas: 0, monto: 0 });
  const r: ResumenSituacion = {
    pagada: vacio(),
    vencida: vacio(),
    por_vencer: vacio(),
    sin_vencimiento: vacio(),
    todas: vacio(),
  };
  for (const d of docs) {
    const s = situacionDe(d, hoy);
    r[s].facturas += 1;
    r[s].monto += s === "pagada" ? d.total : d.saldo;
    r.todas.facturas += 1;
    r.todas.monto += d.total;
  }
  for (const k of Object.keys(r) as (keyof ResumenSituacion)[]) r[k].monto = Math.round(r[k].monto * 100) / 100;
  return r;
}

/**
 * Cómo se ordena la lista. Por número es lo que pidió Willy y va por
 * defecto; «lo más atrasado primero» se queda, que es el orden en que se
 * llama a cobrar.
 */
export const ORDENES = {
  antiguo: "Por número de factura",
  reciente: "Por número, las últimas primero",
  atraso: "Las más atrasadas primero",
} as const;

export type Orden = keyof typeof ORDENES;

/**
 * El orden de la lista. Sin elegir: por número, de la más antigua a la
 * última si es lo que se debe (son decenas, y así se cuadra con su
 * registro), y de la última hacia atrás si entra lo pagado (son cientos, y
 * lo que se busca es lo reciente).
 */
export function ordenPorDefecto(incluyePagadas: boolean): Orden {
  return incluyePagadas ? "reciente" : "antiguo";
}

export function ordenarFacturas<T extends { numero: string; dias_vencido: number; saldo: number }>(
  docs: readonly T[],
  orden: Orden,
): T[] {
  // `numero` va con ceros («F002-00000533»), así que el texto ordena bien
  // dentro de la serie; la serie primero separa F002 de otras.
  const porNumero = (a: T, b: T) => a.numero.localeCompare(b.numero);
  const copia = [...docs];
  if (orden === "atraso") return copia.sort((a, b) => b.dias_vencido - a.dias_vencido || b.saldo - a.saldo || porNumero(a, b));
  if (orden === "reciente") return copia.sort((a, b) => porNumero(b, a));
  return copia.sort(porNumero);
}

export function leerOrden(valor: string | undefined): Orden | null {
  return valor && valor in ORDENES ? (valor as Orden) : null;
}
