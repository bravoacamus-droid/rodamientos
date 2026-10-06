/**
 * Los dos modos de comparar, sin dependencias.
 *
 * Aparte de `ejecutivo.ts` porque los usa un componente del navegador (el
 * filtro), y `ejecutivo.ts` tira del índice de informes, que arrastra
 * consultas `server-only`: importarlo desde el cliente rompe la compilación.
 */

export type ModoComparacion = "anterior" | "anio";

export const ETIQUETA_COMPARACION: Record<ModoComparacion, string> = {
  anterior: "El periodo anterior",
  anio: "El mismo periodo del año pasado",
};

/** Cómo se dice al lado de una cifra: «vs. el año pasado». */
export const FRASE_COMPARACION: Record<ModoComparacion, string> = {
  anterior: "vs. el periodo anterior",
  anio: "vs. el año pasado",
};

export function leerComparacion(valor: string | undefined): ModoComparacion {
  return valor === "anio" ? "anio" : "anterior";
}
