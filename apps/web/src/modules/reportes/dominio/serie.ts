/**
 * Los periodos sin venta, rellenados con cero, para cualquier granularidad.
 *
 * `serie_ventas` y `serie_compras` agrupan con `date_trunc` y solo devuelven
 * los periodos que TIENEN documentos. El gráfico tiene un eje de categorías,
 * así que agosto por días salía «1, 3, 4, 5, 7, 10, 13…»: los días sin venta
 * desaparecían y la curva unía el 7 con el 10 como si se hubiera vendido
 * entre medias. Y mirando «este año», septiembre y octubre —sin una sola
 * factura— no salían: el gráfico terminaba en agosto, en lo más alto, y no
 * contaba la caída (revisión por módulos del 02/10).
 *
 * Es lo mismo que `rellenarMeses` (periodo.ts) para el día, la semana y el
 * año, con una diferencia: se rellena desde el PRIMER periodo con datos y no
 * desde el inicio del rango. «Todo» empieza en 2020 y no hay ventas hasta
 * 2024: serían cuatro años de barras vacías antes del primer dato.
 *
 * Puro: sin reloj, sin red. Las fechas van como texto `yyyy-mm-dd`.
 */

import { inicioDeSemana, sumarDias, sumarMeses, type Grano } from "./rango";

/** Tope de seguridad: un rango de años por días no debe colgar la pantalla. */
const MAX_PERIODOS = 400;

/** El inicio del periodo que contiene `iso`, como `date_trunc` (semana = lunes). */
export function inicioDePeriodo(iso: string, grano: Grano): string {
  const dia = iso.slice(0, 10);
  switch (grano) {
    case "dia":
      return dia;
    case "semana":
      return inicioDeSemana(dia);
    case "mes":
      return `${dia.slice(0, 7)}-01`;
    case "anio":
      return `${dia.slice(0, 4)}-01-01`;
  }
}

function siguiente(iso: string, grano: Grano): string {
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

export function rellenarPeriodos<T extends { periodo: string }>(
  puntos: readonly T[],
  hasta: string,
  grano: Grano,
  vacio: (periodo: string) => T,
): T[] {
  if (puntos.length === 0) return [];

  const porPeriodo = new Map(puntos.map((p) => [p.periodo.slice(0, 10), p]));
  const ordenados = [...porPeriodo.keys()].sort();
  const primero = ordenados[0]!;
  const ultimoDato = ordenados[ordenados.length - 1]!;
  const fin = inicioDePeriodo(hasta, grano);
  // Si algún dato cae después del fin (no debería), se respeta el dato.
  const ultimo = ultimoDato > fin ? ultimoDato : fin;

  const salida: T[] = [];
  let actual = primero;
  while (actual <= ultimo && salida.length < MAX_PERIODOS) {
    salida.push(porPeriodo.get(actual) ?? vacio(actual));
    actual = siguiente(actual, grano);
  }
  return salida;
}
