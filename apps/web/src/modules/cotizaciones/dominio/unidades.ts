/**
 * Nombre legible de la unidad de medida: el que sale en el papel.
 *
 * Vive aparte de `impresion.ts` para que la pantalla lo use sin arrastrar al
 * navegador lo que esa importa (el conector de SUNAT). Desde la revisión por
 * módulos del 02/10 la pantalla también lo usa: enseñaba «NIU», el código de
 * SUNAT, que nadie en la tienda llama así.
 */
const UNIDADES: Record<string, string> = {
  NIU: "UND",
  MTR: "MTR",
  BX: "CAJA",
  SET: "JUEGO",
  ZZ: "SERV",
};

export function unidadLegible(codigo: string): string {
  return UNIDADES[codigo] ?? codigo;
}
