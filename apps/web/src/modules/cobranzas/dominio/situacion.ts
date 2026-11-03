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

/**
 * Días desde el vencimiento, CON signo: positivo si ya venció, negativo si
 * falta (−5 = vence en 5 días). Es lo que necesita el papel para decir
 * «Vence en 5 días»; `v_cartera` da 0 a todo lo que no venció, y por eso el
 * estado de cuenta decía «Vence hoy» de una factura del mes que viene
 * (encontrado el 03/11).
 */
export function diasDesdeVencimiento(vencimiento: string | null, hoy: string): number {
  return vencimiento ? diasEntre(vencimiento.slice(0, 10), hoy) : 0;
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
 * defecto. «Por vencimiento» (Luis, 03/11: «deberían salir primero los
 * próximos a vencer») pone arriba lo que vence antes: lo más vencido, luego
 * lo que vence hoy, mañana… y al final lo que no tiene vencimiento.
 */
export const ORDENES = {
  antiguo: "Por número de factura",
  reciente: "Por número, las últimas primero",
  vencimiento: "Por vencimiento: las que vencen primero",
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

export function ordenarFacturas<T extends { numero: string; fecha_vencimiento: string | null; saldo: number }>(
  docs: readonly T[],
  orden: Orden,
): T[] {
  // `numero` va con ceros («F002-00000533»), así que el texto ordena bien
  // dentro de la serie; la serie primero separa F002 de otras.
  const porNumero = (a: T, b: T) => a.numero.localeCompare(b.numero);
  const copia = [...docs];
  if (orden === "vencimiento") return copia.sort((a, b) => porVencimiento(a, b) || porNumero(a, b));
  if (orden === "reciente") return copia.sort((a, b) => porNumero(b, a));
  return copia.sort(porNumero);
}

/** La fecha de vencimiento, la más próxima primero; sin vencimiento, al final. */
function porVencimiento(a: { fecha_vencimiento: string | null }, b: { fecha_vencimiento: string | null }): number {
  if (a.fecha_vencimiento === b.fecha_vencimiento) return 0;
  if (!a.fecha_vencimiento) return 1;
  if (!b.fecha_vencimiento) return -1;
  return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
}

export function leerOrden(valor: string | undefined): Orden | null {
  // «atraso» era el nombre hasta el 03/11: los enlaces guardados siguen valiendo.
  if (valor === "atraso") return "vencimiento";
  return valor && valor in ORDENES ? (valor as Orden) : null;
}

/**
 * El orden del estado de cuenta (03/11): primero lo que se debe, de lo que
 * vence antes a lo que vence después —es el orden en que se paga, y lo que
 * el cliente tiene que ver arriba—; debajo, lo pagado, por número.
 */
export function ordenarParaCuenta<T extends { numero: string; fecha_vencimiento: string | null; saldo: number }>(
  docs: readonly T[],
): T[] {
  const debe = (d: T) => d.saldo > 0;
  return [...docs].sort((a, b) => {
    if (debe(a) !== debe(b)) return debe(a) ? -1 : 1;
    if (debe(a)) return porVencimiento(a, b) || a.numero.localeCompare(b.numero);
    return a.numero.localeCompare(b.numero);
  });
}
