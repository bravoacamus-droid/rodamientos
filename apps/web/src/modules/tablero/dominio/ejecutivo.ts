/**
 * El tablero ejecutivo: lo que se compara contra qué, y cómo se reparten los
 * clientes.
 *
 * Luis, 06/10, por Willy: *«comparación de sus meses pasados»*. Comparar
 * tiene dos lecturas, y las dos se usan:
 *
 *  · **El periodo anterior**, de la misma longitud: «este trimestre contra el
 *    anterior». Dice si el negocio acelera o frena.
 *  · **El mismo periodo del año pasado**: «agosto contra agosto». Es la que
 *    sirve en un negocio con temporadas, porque no compara un mes flojo con
 *    uno fuerte por el calendario.
 *
 * Puro: sin reloj, sin red. Fechas como texto `aaaa-mm-dd`.
 */

import {
  inicioDePeriodo,
  periodoAnterior,
  sumarDias,
  sumarMeses,
  type Grano,
} from "@/modules/reportes";

import type { ModoComparacion } from "./comparacion";

export {
  ETIQUETA_COMPARACION,
  FRASE_COMPARACION,
  leerComparacion,
  type ModoComparacion,
} from "./comparacion";

/**
 * Un año menos, el mismo día.
 *
 * El 29 de febrero pasa al 28: es el único día que no existe el año anterior,
 * y caer en el 1 de marzo correría el rango un día entero.
 */
export function restarUnAnio(iso: string): string {
  const anio = Number(iso.slice(0, 4)) - 1;
  const mesDia = iso.slice(5, 10);
  if (mesDia === "02-29") return `${anio}-02-28`;
  return `${anio}-${mesDia}`;
}

/** El rango contra el que se compara. */
export function rangoComparado(
  rango: { desde: string; hasta: string },
  modo: ModoComparacion,
): { desde: string; hasta: string } {
  if (modo === "anio") {
    return { desde: restarUnAnio(rango.desde), hasta: restarUnAnio(rango.hasta) };
  }
  /*
    Si el rango empieza un día 1, el anterior son los MISMOS MESES de antes.

    Por longitud de días, «los últimos 12 meses» (1 nov – 6 oct, 340 días)
    tenía como anterior del 26 nov al 31 oct: el primer mes de la comparación
    salía con cinco días y su barra casi vacía, como si ese noviembre no se
    hubiera vendido (06/10, al mirarlo en pantalla). Con meses enteros,
    «este mes» del 1 al 6 se compara con el 1 al 6 del mes pasado, que es lo
    que se quiere: los mismos días, no un mes completo contra seis días.
  */
  if (rango.desde.slice(8, 10) === "01") {
    const mesesDe = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
    const meses = mesesDe(rango.hasta) - mesesDe(rango.desde) + 1;
    return { desde: sumarMeses(rango.desde, -meses), hasta: restarMeses(rango.hasta, meses) };
  }
  return periodoAnterior(rango);
}

/** Restar meses conservando el día; si el mes no lo tiene (31 → feb), su último día. */
function restarMeses(iso: string, meses: number): string {
  const inicio = sumarMeses(`${iso.slice(0, 7)}-01`, -meses);
  const ultimo = Number(sumarDias(sumarMeses(inicio, 1), -1).slice(8, 10));
  const dia = Math.min(Number(iso.slice(8, 10)), ultimo);
  return `${inicio.slice(0, 8)}${String(dia).padStart(2, "0")}`;
}

function siguientePeriodo(iso: string, grano: Grano): string {
  switch (grano) {
    case "dia":
      return sumarDias(iso, 1);
    case "semana":
      return sumarDias(iso, 7);
    case "mes":
      return sumarMeses(iso, 1);
    case "anio":
      return sumarMeses(iso, 12);
  }
}

/**
 * Todos los periodos del rango, del primero al último, tengan datos o no.
 *
 * A diferencia de `rellenarPeriodos` (Informes), arranca en el INICIO del
 * rango y no en el primer dato: aquí hay dos series que se ponen una al lado
 * de la otra, y si la de este año empezara en marzo y la del pasado en enero,
 * cada barra se compararía con el mes equivocado.
 */
export function periodosDelRango(desde: string, hasta: string, grano: Grano): string[] {
  const salida: string[] = [];
  const fin = inicioDePeriodo(hasta, grano);
  let actual = inicioDePeriodo(desde, grano);
  while (actual <= fin && salida.length < 400) {
    salida.push(actual);
    actual = siguientePeriodo(actual, grano);
  }
  return salida;
}

/**
 * Una serie con su comparación al lado, periodo a periodo.
 *
 * Se empareja por POSICIÓN: el primer mes del rango con el primer mes del
 * rango de comparación. Con «el año pasado» eso es agosto con agosto; con «el
 * periodo anterior», el primer mes de cada tramo. Si el de comparación tiene
 * un periodo menos (pasa al partir semanas), el último queda sin pareja y se
 * dice con `null`, no con un cero que parecería una caída.
 */
export function emparejar<T extends { periodo: string }>(
  actual: readonly T[],
  previo: readonly T[],
  periodosActual: readonly string[],
  periodosPrevio: readonly string[],
  valor: (p: T) => number,
): { periodo: string; periodoPrevio: string | null; actual: number; previo: number | null }[] {
  const mapaA = new Map(actual.map((p) => [p.periodo.slice(0, 10), valor(p)]));
  const mapaP = new Map(previo.map((p) => [p.periodo.slice(0, 10), valor(p)]));
  return periodosActual.map((periodo, i) => {
    const periodoPrevio = periodosPrevio[i] ?? null;
    return {
      periodo,
      periodoPrevio,
      actual: mapaA.get(periodo) ?? 0,
      previo: periodoPrevio === null ? null : (mapaP.get(periodoPrevio) ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface FilaCliente {
  id: string;
  cliente: string;
  documento: string | null;
  venta: number;
  documentos: number;
  ventaPrev: number;
  documentosPrev: number;
  primera: string;
  ultima: string;
  documentosHist: number;
  diasSinComprar: number;
}

/**
 * En qué grupo cae un cliente al comparar los dos rangos.
 *
 * Son las cinco preguntas que Willy se hace de su cartera, en su orden:
 * quién es nuevo, quién me compra más, quién me compra menos, quién dejó de
 * venir y quién sigue igual.
 */
export type Segmento = "nuevo" | "crece" | "baja" | "perdido" | "estable";

export const ETIQUETA_SEGMENTO: Record<Segmento, string> = {
  nuevo: "Nuevos",
  crece: "Compran más",
  baja: "Compran menos",
  perdido: "Dejaron de comprar",
  estable: "Igual que antes",
};

/** Lo que se explica debajo de cada grupo, en una frase sin jerga. */
export const EXPLICA_SEGMENTO: Record<Segmento, string> = {
  nuevo: "Su primera compra de siempre cae en este periodo",
  crece: "Compraron más de un 10 % más que en la comparación",
  baja: "Compraron más de un 10 % menos que en la comparación",
  perdido: "Compraron en la comparación y en este periodo no",
  estable: "Entre un 10 % arriba y un 10 % abajo",
};

/**
 * El umbral del ±10 %.
 *
 * Por debajo, la diferencia entre dos periodos de un cliente que compra tres
 * veces al año es ruido: una factura que cae el 31 o el 1 lo mueve de grupo.
 */
const UMBRAL = 0.1;

export function segmentoDe(f: FilaCliente, desde: string, hasta: string): Segmento {
  if (f.primera >= desde && f.primera <= hasta) return "nuevo";
  if (f.venta === 0 && f.ventaPrev > 0) return "perdido";
  if (f.ventaPrev === 0) return "crece";
  const cambio = (f.venta - f.ventaPrev) / f.ventaPrev;
  if (cambio > UMBRAL) return "crece";
  if (cambio < -UMBRAL) return "baja";
  return "estable";
}

export interface ResumenSegmento {
  segmento: Segmento;
  clientes: number;
  venta: number;
  ventaPrev: number;
}

export const ORDEN_SEGMENTOS: readonly Segmento[] = [
  "nuevo",
  "crece",
  "estable",
  "baja",
  "perdido",
];

export function resumirSegmentos(
  filas: readonly FilaCliente[],
  desde: string,
  hasta: string,
): ResumenSegmento[] {
  const acc = new Map<Segmento, ResumenSegmento>(
    ORDEN_SEGMENTOS.map((s) => [s, { segmento: s, clientes: 0, venta: 0, ventaPrev: 0 }]),
  );
  for (const f of filas) {
    const r = acc.get(segmentoDe(f, desde, hasta))!;
    r.clientes += 1;
    r.venta += f.venta;
    r.ventaPrev += f.ventaPrev;
  }
  return ORDEN_SEGMENTOS.map((s) => acc.get(s)!);
}

/**
 * Cuánto de la venta se llevan los `n` primeros, de 0 a 100.
 *
 * Es el riesgo de cartera: si cinco clientes son el 80 % y uno se va, se va
 * un cuarto del negocio. Null sin venta: un 0 % diría «nada concentrado».
 */
export function concentracion(filas: readonly FilaCliente[], n: number): number | null {
  const total = filas.reduce((s, f) => s + f.venta, 0);
  if (total <= 0) return null;
  const primeros = [...filas]
    .sort((a, b) => b.venta - a.venta)
    .slice(0, n)
    .reduce((s, f) => s + f.venta, 0);
  return (primeros / total) * 100;
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

/**
 * De las que ya se decidieron, cuántas se ganaron. De 0 a 100.
 *
 * Las que siguen en juego (borrador, enviada) NO cuentan: no se han perdido.
 * Meterlas en el denominador hundiría la tasa cada vez que se cotiza mucho,
 * que es justo cuando el negocio va bien. Null si no se ha decidido ninguna.
 */
export function tasaDeCierre(r: {
  aprobada: number;
  rechazada: number;
  vencida: number;
}): number | null {
  const decididas = r.aprobada + r.rechazada + r.vencida;
  if (decididas === 0) return null;
  return (r.aprobada / decididas) * 100;
}
