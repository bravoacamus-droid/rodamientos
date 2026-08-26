/**
 * El rango de fechas y la granularidad de los informes.
 *
 * Willy, 26/08 (2:00): *«faltaría aquí los filtros por día, por mes, por año,
 * entre fechas. De tal fecha a tal fecha cuánto he vendido»*.
 *
 * Todo es puro y todo entra y sale como texto `aaaa-mm-dd`. El «hoy» lo
 * inyecta quien llama, igual que en `periodo.ts`: un informe no puede cambiar
 * de resultado según la zona horaria del equipo que lo abre.
 */

/** Las cuatro granularidades que acepta `unidad_periodo()` en la base. */
export type Grano = "dia" | "semana" | "mes" | "anio";

export const GRANOS: readonly Grano[] = ["dia", "semana", "mes", "anio"];

export const ETIQUETA_GRANO: Record<Grano, string> = {
  dia: "Por día",
  semana: "Por semana",
  mes: "Por mes",
  anio: "Por año",
};

/** Los atajos que se usan de verdad. `personalizado` no es uno: es el resto. */
export type Atajo =
  | "hoy"
  | "semana"
  | "mes"
  | "mes_pasado"
  | "trimestre"
  | "anio"
  | "12_meses"
  | "todo";

export const ETIQUETA_ATAJO: Record<Atajo, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
  mes_pasado: "Mes pasado",
  trimestre: "Últimos 3 meses",
  anio: "Este año",
  "12_meses": "Últimos 12 meses",
  todo: "Todo",
};

export interface Rango {
  desde: string;
  hasta: string;
  grano: Grano;
}

/** Suma (o resta) días a una fecha ISO, sin tocar zonas horarias. */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Suma meses quedándose en el día 1. Aritmética de año/mes, no de días. */
export function sumarMeses(iso: string, meses: number): string {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const total = anio * 12 + (mes - 1) + meses;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

/** El último día del mes de una fecha. */
export function finDeMes(iso: string): string {
  const siguiente = sumarMeses(`${iso.slice(0, 7)}-01`, 1);
  return sumarDias(siguiente, -1);
}

/**
 * El lunes de la semana de una fecha.
 *
 * Lunes y no domingo porque es lo que hace `date_trunc('week')` en Postgres, y
 * porque es la semana laboral de aquí. Si la pantalla partiera la semana en
 * domingo y la base en lunes, «esta semana» enseñaría un día de más o de menos
 * según qué consulta la calcule.
 */
export function inicioDeSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay(): 0 = domingo. El lunes es 1, así que el domingo retrocede 6.
  const dia = d.getUTCDay();
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

/**
 * La granularidad que tiene sentido para un rango.
 *
 * No es una preferencia: es evitar un gráfico ilegible. Tres años por día son
 * mil barras en un ancho de pantalla, y un solo día por mes es una barra. Se
 * elige por la longitud del rango, y quien quiera otra cosa la cambia a mano.
 */
export function granoSugerido(desde: string, hasta: string): Grano {
  const dias =
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;

  if (dias <= 45) return "dia";
  if (dias <= 180) return "semana";
  if (dias <= 1095) return "mes"; // hasta tres años
  return "anio";
}

/**
 * Traduce un atajo a un rango concreto.
 *
 * `todo` arranca en 2020: antes de eso no hay negocio que mirar, y una fecha
 * imposible como 1900 hace que el eje del gráfico no signifique nada.
 */
export function rangoDeAtajo(atajo: Atajo, hoy: string): { desde: string; hasta: string } {
  switch (atajo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "semana":
      return { desde: inicioDeSemana(hoy), hasta: hoy };
    case "mes":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case "mes_pasado": {
      const inicio = sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
      return { desde: inicio, hasta: finDeMes(inicio) };
    }
    case "trimestre":
      return { desde: sumarMeses(`${hoy.slice(0, 7)}-01`, -2), hasta: hoy };
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case "12_meses":
      return { desde: sumarMeses(`${hoy.slice(0, 7)}-01`, -11), hasta: hoy };
    default:
      return { desde: "2020-01-01", hasta: hoy };
  }
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee el rango de los search params, con `12_meses` por defecto.
 *
 * Nada de lo que llega se usa sin comprobar: son parámetros de URL, o sea que
 * cualquiera puede escribir lo que quiera en ellos. Una fecha con formato raro
 * cae al valor por defecto en lugar de viajar a la base.
 *
 * Si el `hasta` queda antes del `desde` se intercambian en vez de devolver un
 * informe vacío: es un error de dedo evidente y la respuesta útil es el
 * informe que se quería, no una pantalla en blanco.
 */
export function leerRango(
  params: { desde?: string; hasta?: string; grano?: string; atajo?: string },
  hoy: string,
): Rango & { atajo: Atajo | null } {
  const atajo = (Object.keys(ETIQUETA_ATAJO) as Atajo[]).find((a) => a === params.atajo);

  let desde: string;
  let hasta: string;

  if (atajo) {
    ({ desde, hasta } = rangoDeAtajo(atajo, hoy));
  } else if (ES_FECHA.test(params.desde ?? "") && ES_FECHA.test(params.hasta ?? "")) {
    desde = params.desde as string;
    hasta = params.hasta as string;
    if (hasta < desde) [desde, hasta] = [hasta, desde];
  } else {
    ({ desde, hasta } = rangoDeAtajo("12_meses", hoy));
  }

  const grano = GRANOS.find((g) => g === params.grano) ?? granoSugerido(desde, hasta);

  return { desde, hasta, grano, atajo: atajo ?? null };
}

/** Etiqueta del eje según la granularidad: «25 ago», «ago 26», «2026». */
const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function etiquetaPeriodo(iso: string, grano: Grano): string {
  const [a, m, d] = iso.split("-");
  if (!a || !m) return iso;
  const mes = MESES[Number(m) - 1] ?? m;

  switch (grano) {
    case "dia":
      return `${Number(d)} ${mes}`;
    case "semana":
      // «sem. 25 ago» y no el número de semana ISO: nadie sabe de memoria qué
      // días son la semana 34, y sí sabe qué es «la del 25 de agosto».
      return `sem. ${Number(d)} ${mes}`;
    case "anio":
      return a;
    default:
      return `${mes} ${a.slice(2)}`;
  }
}

/** Cómo se lee el rango en una frase: «del 1 de enero al 26 de agosto». */
export function describirRango(rango: Rango, hoy: string): string {
  if (rango.desde === rango.hasta) {
    return rango.desde === hoy ? "hoy" : `el ${diaLargo(rango.desde)}`;
  }
  return `del ${diaLargo(rango.desde)} al ${diaLargo(rango.hasta)}`;
}

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function diaLargo(iso: string): string {
  const [a, m, d] = iso.split("-");
  const mes = MESES_LARGOS[Number(m) - 1] ?? m;
  return `${Number(d)} de ${mes} de ${a}`;
}

/**
 * El periodo inmediatamente anterior, de la misma longitud.
 *
 * Es contra lo que se compara un indicador. Con el rango «este mes» da el mes
 * pasado; con «últimos 7 días», los 7 anteriores; con un rango a mano de 43
 * días, los 43 de antes.
 *
 * Se hace por longitud y no por «el mes anterior» a propósito: comparar 26 días
 * de agosto contra los 31 de julio dice que se vendió menos aunque se esté
 * vendiendo más por día, y ese es exactamente el error que hace que nadie se
 * fíe de la comparación.
 */
export function periodoAnterior(rango: Pick<Rango, "desde" | "hasta">): {
  desde: string;
  hasta: string;
} {
  const dias = diasDelRango(rango);
  return {
    desde: sumarDias(rango.desde, -dias),
    hasta: sumarDias(rango.desde, -1),
  };
}

/**
 * Cuántos días tiene el rango, contando los dos extremos.
 *
 * Del 25 al 25 es UN día, no cero: es el periodo que se está mirando, no la
 * distancia entre dos fechas. La diferencia importa al dividir para sacar un
 * promedio diario.
 */
export function diasDelRango(rango: Pick<Rango, "desde" | "hasta">): number {
  const dias =
    (Date.parse(`${rango.hasta}T00:00:00Z`) - Date.parse(`${rango.desde}T00:00:00Z`)) /
    86_400_000;
  return Math.max(1, Math.round(dias) + 1);
}
