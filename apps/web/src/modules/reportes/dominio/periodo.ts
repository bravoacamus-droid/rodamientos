/**
 * Cálculos de periodo, puros y probables sin base de datos.
 *
 * Todo entra y sale como texto `aaaa-mm-dd`. El dominio no lee reloj ni
 * construye fechas «de hoy» por su cuenta: la fecha del servidor la inyecta
 * quien llama. Es lo que permite probar «el mes anterior a enero» sin esperar
 * a enero, y lo que evita que un informe cambie de resultado según la zona
 * horaria del equipo que lo abre.
 */

/** Etiqueta corta para el eje de un gráfico: `2026-08-01` → «ago 26». */
const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function etiquetaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = MESES[Number(m[2]) - 1] ?? m[2];
  return `${mes} ${m[1]!.slice(2)}`;
}

/** El primer día del mes de una fecha. */
export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Retrocede `n` meses desde una fecha, quedándose en el día 1.
 *
 * Se hace con aritmética de año/mes y no sumando días: restar 30 días a un
 * 31 de marzo da el 1 de marzo, no febrero, y la serie saldría con un mes
 * repetido.
 */
export function mesesAtras(iso: string, n: number): string {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const total = anio * 12 + (mes - 1) - n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

/** El último día del mes de una fecha. */
export function finDeMes(iso: string): string {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  // Día 0 del mes siguiente = último día de este.
  const d = new Date(Date.UTC(anio, mes, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Rellena los meses sin ventas.
 *
 * Sin esto, un mes en blanco no aparece y el gráfico une agosto con octubre
 * como si septiembre no hubiera existido — que es justo lo contrario de lo que
 * hay que ver. Un mes sin ventas es información.
 */
export function rellenarMeses<T extends { mes: string }>(
  filas: readonly T[],
  desde: string,
  hasta: string,
  vacio: (mes: string) => T,
): T[] {
  const porMes = new Map(filas.map((f) => [inicioDeMes(f.mes), f]));
  const salida: T[] = [];

  let cursor = inicioDeMes(desde);
  const fin = inicioDeMes(hasta);
  // Tope defensivo: 120 meses son diez años. Si se pasa, algo va mal en los
  // parámetros y es mejor cortar que colgar el servidor en un bucle.
  for (let i = 0; i < 120 && cursor <= fin; i++) {
    salida.push(porMes.get(cursor) ?? vacio(cursor));
    cursor = mesesAtras(cursor, -1);
  }

  return salida;
}

/** Variación porcentual entre dos periodos. `null` si no hay con qué comparar. */
export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/**
 * Orden de los tramos de aging.
 *
 * Los códigos son los que devuelve `v_cartera` en `tramo_aging`, tal cual.
 * Ordenarlos alfabéticamente pondría «1_30» antes que «por_vencer», que no
 * dice nada: el orden es el del RIESGO, de lo que aún no vence a lo que lleva
 * más tiempo sin cobrarse.
 */
export const ORDEN_AGING = [
  "sin_vencimiento",
  "por_vencer",
  "1_30",
  "31_60",
  "61_90",
  "mas_90",
] as const;

/** Cómo se llama cada tramo en pantalla. */
export const ETIQUETA_AGING: Record<string, string> = {
  sin_vencimiento: "Sin vencimiento",
  por_vencer: "Por vencer",
  "1_30": "1 a 30 días",
  "31_60": "31 a 60 días",
  "61_90": "61 a 90 días",
  mas_90: "Más de 90 días",
};

/**
 * Color de cada tramo, del verde al rojo.
 *
 * La escala es el mensaje: un aging en un solo color obliga a leer las
 * etiquetas para saber qué preocupa. Se usan los tokens del tema para que
 * funcione igual en claro y en oscuro.
 */
export const COLOR_AGING: Record<string, string> = {
  sin_vencimiento: "var(--fg-subtle)",
  por_vencer: "var(--ok)",
  "1_30": "var(--warn)",
  "31_60": "var(--warn)",
  "61_90": "var(--danger)",
  mas_90: "var(--danger)",
};

export function etiquetaAging(tramo: string): string {
  return ETIQUETA_AGING[tramo] ?? tramo;
}

export function ordenarAging<T extends { tramo: string }>(filas: readonly T[]): T[] {
  const peso = (t: string) => {
    const i = ORDEN_AGING.indexOf(t as (typeof ORDEN_AGING)[number]);
    // Lo que no reconoce va al final, pero NO se pierde: un tramo nuevo en la
    // vista tiene que seguir sumando en el total aunque no sepamos pintarlo.
    return i === -1 ? ORDEN_AGING.length : i;
  };
  return [...filas].sort((a, b) => peso(a.tramo) - peso(b.tramo));
}
