import "server-only";

import type { Cabecera } from "../dominio/plantilla";
import { detectarCabecera, leerFilas } from "../dominio/plantilla";
import type { FilaPlantilla, ProblemaArchivo } from "../dominio/tipos";

/**
 * De un .xlsx a una matriz de texto.
 *
 * Vive aparte del archivo de acciones para poder probarlo contra la plantilla
 * de verdad: la conversión de celdas es donde están los casos que un test
 * sintético no reproduce —celdas con fórmula, texto enriquecido, fechas— y es
 * justo la capa que toca un archivo que llenó una persona.
 *
 * Se lee SIEMPRE en el servidor: ExcelJS pesa cerca de un mega y en el
 * navegador lo pagaría todo el mundo, use el importador o no.
 */

/** El valor de una celda, como texto. */
export function valorCelda(celda: unknown): string {
  if (celda === null || celda === undefined) return "";

  if (celda instanceof Date) return celda.toISOString().slice(0, 10);

  if (typeof celda === "object") {
    const o = celda as Record<string, unknown>;

    // Texto con formato: se concatenan los trozos.
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    }

    // Celda con fórmula: interesa el RESULTADO, no la fórmula. Es el caso del
    // P.V. de la plantilla, que viene calculado como costo x 1.20; leer la
    // fórmula daría la cadena "IF(H2=...)" y la fila se rechazaría entera.
    if ("result" in o) {
      const r = o.result;
      if (r === null || r === undefined) return "";
      // Una fórmula que devolvió error (#N/A, #REF!) llega como objeto.
      if (typeof r === "object") return "";
      return String(r);
    }

    // Hipervínculo y similares.
    if (typeof o.text === "string") return o.text;

    return "";
  }

  return String(celda);
}

/** Convierte la hoja de datos del libro en `string[][]`. */
export async function matrizDeArchivo(datos: ArrayBuffer): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);

  // La hoja PRODUCTOS si está; si no, la primera visible. Que alguien la
  // renombre no debería romper la carga.
  const hoja =
    wb.worksheets.find((w) => w.name.toUpperCase() === "PRODUCTOS") ??
    wb.worksheets.find((w) => w.state === "visible") ??
    wb.worksheets[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const columnas = Math.max(hoja.columnCount, 10);
  const matriz: string[][] = [];

  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const celdas: string[] = [];
    for (let c = 1; c <= columnas; c += 1) {
      celdas.push(valorCelda(fila.getCell(c).value));
    }
    matriz[numero - 1] = celdas;
  });

  // `eachRow` deja huecos donde había filas vacías intercaladas.
  for (let i = 0; i < matriz.length; i += 1) matriz[i] ??= [];
  return matriz;
}

export interface LecturaArchivo {
  cabecera: Cabecera;
  filas: FilaPlantilla[];
  problemas: ProblemaArchivo[];
}

/** Archivo -> filas tipadas. Devuelve null si no se reconoce la plantilla. */
export async function leerPlantilla(
  datos: ArrayBuffer,
): Promise<LecturaArchivo | null> {
  const matriz = await matrizDeArchivo(datos);
  const cabecera = detectarCabecera(matriz);
  if (!cabecera) return null;
  return { cabecera, ...leerFilas(matriz, cabecera) };
}
