/**
 * «¿Cómo voy este mes?» (20/10).
 *
 * Luis: *«cómo veo mis ventas, el promedio de ventas del mes pasado, cuánto
 * llevo vendiendo hasta ahora, que me digas si estoy bien, todo sumado, con tu
 * mejor recomendación»*.
 *
 * El indicador que había comparaba el mes EN CURSO con el mes pasado ENTERO:
 * el día 10 casi siempre salía «−70 %», y una alarma que suena siempre no se
 * lee. Aquí se compara lo que es comparable:
 *
 * - **A la misma fecha del mes pasado**: del 1 al día de hoy, en los dos.
 * - **El ritmo**: lo vendido por día, llevado al mes entero, contra la
 *   **meta del mes**.
 *
 * La meta es el promedio de los meses cerrados del año —de enero al mes
 * anterior— y el tope, el mejor de ellos. Luis, 20/10: *«cada mes tengo un
 * volumen de venta… cuál es el tope que estoy vendiendo, cuánto debería
 * vender, como si fuera mi límite… desde enero hasta el mes anterior, que
 * sería septiembre, porque estamos en octubre, con gráficos»*. En enero no hay
 * meses cerrados del año: se toman los doce anteriores.
 *
 * Y una recomendación con una cifra que se pueda hacer: cuánto hay que vender
 * por día lo que queda de mes para llegar al promedio.
 *
 * Puro: las ventas por día y el día de hoy entran desde fuera.
 */

import { finDeMes, inicioDeMes, mesesAtras } from "./periodo";

export interface VentaDelDia {
  /** aaaa-mm-dd */
  fecha: string;
  /** Sin IGV, en dólares. */
  monto: number;
}

export interface MesDeLaSerie {
  /** aaaa-mm-01 */
  mes: string;
  monto: number;
  /** El mes en curso: va a medias. */
  enCurso: boolean;
}

export type Veredicto = "bien" | "justo" | "abajo" | "sin_datos";

export interface ComoVoy {
  hoy: string;
  dia: number;
  diasDelMes: number;
  /** Del 1 a hoy, este mes. */
  vendido: number;
  /** Del 1 al mismo día, el mes pasado. */
  mismaFechaMesPasado: number;
  /** El mes pasado entero. */
  mesPasado: number;
  /** La meta del mes: el promedio de los meses de referencia. */
  promedio: number;
  mesesPromediados: number;
  /** El primero y el último mes de la referencia (aaaa-mm-01). */
  referenciaDesde: string | null;
  referenciaHasta: string | null;
  /** El tope: el mejor mes de la referencia. */
  mejorMes: { mes: string; monto: number } | null;
  /** Los meses de la referencia y el mes en curso, para el gráfico. */
  serie: MesDeLaSerie[];
  /** Lo vendido por día, llevado al mes entero. */
  proyeccion: number;
  veredicto: Veredicto;
  /** La meta del mes: la puesta en Datos de la empresa o, sin ella, el promedio. */
  meta: number;
  /** Si la meta la puso alguien (140) o es el promedio. */
  metaPuesta: boolean;
  /** Lo que falta para llegar a la meta (0 si ya se llegó). */
  faltaParaMeta: number;
  /** La última venta registrada: si es vieja, los números están incompletos. */
  ultimaVenta: string | null;
  /** Hace cuántos días fue la última venta. */
  diasSinVentas: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/**
 * Antes del día 5 el ritmo dice poco: dos facturas grandes el día 2 dan una
 * proyección de millones. Hasta entonces el veredicto es por la misma fecha.
 */
export const DIA_MINIMO_PARA_PROYECTAR = 5;

export interface OpcionesComoVoy {
  /**
   * Los meses con que se compara, si se eligieron arriba en Informes (Luis,
   * 20/10: *«también puedo escoger desde qué fecha a qué fecha»*). Solo
   * cuentan los meses CERRADOS de ese rango.
   */
  referencia?: { desde: string; hasta: string } | null;
  /** La meta del mes de Datos de la empresa (140). */
  meta?: number | null;
}

/** De enero al mes anterior; en enero, los doce anteriores. */
function referenciaPorDefecto(hoy: string): string[] {
  const cuantos = hoy.slice(5, 7) === "01" ? 12 : Number(hoy.slice(5, 7)) - 1;
  const meses: string[] = [];
  for (let i = cuantos; i >= 1; i--) meses.push(mesesAtras(hoy, i));
  return meses;
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let m = inicioDeMes(desde);
  for (let i = 0; i < 120 && m <= hasta; i++) {
    meses.push(m);
    m = mesesAtras(m, -1);
  }
  return meses;
}

export function comoVoy(hoy: string, ventas: readonly VentaDelDia[], opciones: OpcionesComoVoy = {}): ComoVoy {
  const mes = inicioDeMes(hoy);
  const dia = Number(hoy.slice(8, 10));
  const diasDelMes = Number(finDeMes(hoy).slice(8, 10));
  const mesAnt = mesesAtras(hoy, 1);
  const diasMesAnt = Number(finDeMes(mesAnt).slice(8, 10));
  const tope = `${mesAnt.slice(0, 8)}${String(Math.min(dia, diasMesAnt)).padStart(2, "0")}`;

  let vendido = 0;
  let mismaFecha = 0;
  const porMes = new Map<string, number>();
  let ultimaVenta: string | null = null;
  let primera: string | null = null;

  for (const v of ventas) {
    if (v.fecha > hoy) continue;
    if (v.fecha >= mes) vendido += v.monto;
    if (v.fecha >= mesAnt && v.fecha <= tope) mismaFecha += v.monto;
    const m = inicioDeMes(v.fecha);
    porMes.set(m, (porMes.get(m) ?? 0) + v.monto);
    if (v.monto > 0 && (ultimaVenta === null || v.fecha > ultimaVenta)) ultimaVenta = v.fecha;
    if (primera === null || v.fecha < primera) primera = v.fecha;
  }

  // Los meses de referencia: los cerrados del rango elegido o, si no se eligió
  // ninguno (o no tiene meses cerrados), de enero al mes anterior. Sin los que
  // van antes de la primera venta: un mes en que el sistema no tenía datos no
  // es un mes de cero ventas.
  const elegidos = opciones.referencia
    ? mesesEntre(opciones.referencia.desde, opciones.referencia.hasta < mesAnt ? opciones.referencia.hasta : mesAnt)
    : [];
  const candidatos = elegidos.length > 0 ? elegidos : referenciaPorDefecto(hoy);
  const referencia = candidatos.filter((m) => primera !== null && m >= inicioDeMes(primera));
  const cerrados = referencia.map((m) => porMes.get(m) ?? 0);
  const promedio = cerrados.length > 0 ? cerrados.reduce((a, b) => a + b, 0) / cerrados.length : 0;
  let mejorMes: { mes: string; monto: number } | null = null;
  for (const m of referencia) {
    const v = porMes.get(m) ?? 0;
    if (v > 0 && (mejorMes === null || v > mejorMes.monto)) mejorMes = { mes: m, monto: r2(v) };
  }
  const serie: MesDeLaSerie[] = [
    ...referencia.map((m) => ({ mes: m, monto: r2(porMes.get(m) ?? 0), enCurso: false })),
    { mes, monto: r2(vendido), enCurso: true },
  ];

  const proyeccion = dia > 0 ? (vendido / dia) * diasDelMes : 0;
  const metaPuesta = (opciones.meta ?? 0) > 0;
  const meta = metaPuesta ? (opciones.meta as number) : promedio;
  const faltaParaMeta = Math.max(0, meta - vendido);

  // Con pocos días, la referencia es la misma fecha del mes pasado; después,
  // el ritmo contra la meta.
  const contra = dia < DIA_MINIMO_PARA_PROYECTAR ? mismaFecha : meta;
  const medida = dia < DIA_MINIMO_PARA_PROYECTAR ? vendido : proyeccion;
  const veredicto: Veredicto =
    contra <= 0 ? "sin_datos" : medida >= contra ? "bien" : medida >= contra * 0.9 ? "justo" : "abajo";

  return {
    hoy,
    dia,
    diasDelMes,
    vendido: r2(vendido),
    mismaFechaMesPasado: r2(mismaFecha),
    mesPasado: r2(porMes.get(mesAnt) ?? 0),
    promedio: r2(promedio),
    mesesPromediados: cerrados.length,
    referenciaDesde: referencia[0] ?? null,
    referenciaHasta: referencia[referencia.length - 1] ?? null,
    mejorMes,
    serie,
    proyeccion: r2(proyeccion),
    veredicto,
    meta: r2(meta),
    metaPuesta,
    faltaParaMeta: r2(faltaParaMeta),
    ultimaVenta,
    diasSinVentas: ultimaVenta ? dias(ultimaVenta, hoy) : null,
  };
}

/**
 * Más de una semana sin ninguna factura, en un negocio que factura casi todos
 * los días, no es una mala racha: es que las ventas se están haciendo en otro
 * sitio (el sistema anterior) y aquí no llegaron.
 */
export function datosIncompletos(c: Pick<ComoVoy, "diasSinVentas">): boolean {
  return c.diasSinVentas !== null && c.diasSinVentas > 7;
}
