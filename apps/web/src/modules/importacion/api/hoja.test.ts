import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { valorCelda } from "./hoja";
import { detectarCabecera, leerFilas } from "../dominio/plantilla";

/**
 * Prueba contra la PLANTILLA DE VERDAD, la misma que se le manda al cliente.
 *
 * No hay archivo de prueba sintético a propósito: los casos que rompen —la
 * celda con fórmula, el código con espacio, las 197 filas en blanco que la
 * plantilla trae preparadas— solo aparecen en el archivo real. Si alguien
 * cambia el generador y rompe la lectura, esto se entera.
 */

const RUTA = resolve(
  __dirname,
  "../../../../../../docs/plantillas/Rodatech - Maestro de productos.xlsx",
);

/** Réplica de `matrizDeArchivo` sin el import dinámico, para poder testear. */
async function matriz(): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  // ExcelJS empaqueta sus propios tipos de Node, así que su `Buffer` no es
  // el global y ningún cast a `Buffer` cuadra. Se toma el tipo del propio
  // parámetro, que es el único que siempre encaja.
  type Entrada = Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(readFileSync(RUTA) as unknown as Entrada);
  const hoja = wb.worksheets.find((w) => w.name.toUpperCase() === "PRODUCTOS")!;
  const columnas = Math.max(hoja.columnCount, 10);
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const celdas: string[] = [];
    for (let c = 1; c <= columnas; c += 1) {
      celdas.push(valorCelda(fila.getCell(c).value));
    }
    filas[numero - 1] = celdas;
  });
  for (let i = 0; i < filas.length; i += 1) filas[i] ??= [];
  return filas;
}

describe("valorCelda", () => {
  it("de una celda con fórmula devuelve el RESULTADO, no la fórmula", () => {
    // Es EL caso del P.V. de la plantilla. Leer la fórmula devolvería
    // "IF(H2=...)" y la fila se rechazaría entera.
    expect(valorCelda({ formula: 'IF(H2="","",ROUND(H2*1.2,2))', result: 3.92 })).toBe("3.92");
  });

  it("una fórmula con error da cadena vacía, no basura", () => {
    expect(valorCelda({ formula: "A1/0", result: { error: "#DIV/0!" } })).toBe("");
  });

  it("una fórmula sin calcular da cadena vacía", () => {
    expect(valorCelda({ formula: "X", result: null })).toBe("");
  });

  it("junta el texto con formato", () => {
    expect(
      valorCelda({ richText: [{ text: "6205" }, { text: "-2RS1" }] }),
    ).toBe("6205-2RS1");
  });

  it("celdas simples", () => {
    expect(valorCelda(35)).toBe("35");
    expect(valorCelda("SKF")).toBe("SKF");
    expect(valorCelda(null)).toBe("");
  });
});

describe("la plantilla real", () => {
  it("se reconoce la cabecera y todas sus columnas", async () => {
    const c = detectarCabecera(await matriz());
    expect(c).not.toBeNull();
    expect(c?.indice).toBe(0);
    expect(Object.keys(c!.mapa)).toHaveLength(10);
  });

  it("lee las tres filas de ejemplo entre 200 filas preparadas", async () => {
    const m = await matriz();
    const { filas, problemas } = leerFilas(m, detectarCabecera(m)!);

    // Las 197 filas vacías que la plantilla trae preparadas no ensucian nada.
    expect(problemas).toEqual([]);
    expect(filas).toHaveLength(3);

    expect(filas[0]).toMatchObject({
      fila: 2,
      codigo: "6205-2RS1/C3",
      familia: "RODAMIENTO",
      subfamilia: "RIGIDO DE BOLAS",
      marca: "SKF",
      stock: 35,
      stock_minimo: 8,
      precio_compra: 3.26,
      precio_venta: 3.92,
      precio_minimo: 3.86,
    });
  });

  it("el P.V. de los ejemplos es el del cliente, no el recalculado", async () => {
    // De sus 7 productos, 6 cumplen ROUND(costo x 1.20, 2) al céntimo y el
    // 6205-2RS1/C3 tiene 3.92 donde la fórmula da 3.91: un precio puesto a
    // mano. Las filas de ejemplo llevan el valor literal justamente para que
    // Excel no se lo recalcule al abrir el archivo.
    const m = await matriz();
    const { filas } = leerFilas(m, detectarCabecera(m)!);

    expect(filas[0]?.precio_compra).toBe(3.26);
    expect(filas[0]?.precio_venta).toBe(3.92);
    expect(Math.round(3.26 * 1.2 * 100) / 100).toBe(3.91);
  });

  it("la fórmula de las filas vacías no crea productos fantasma", async () => {
    // Las 197 filas preparadas llevan IF(costo="","",...). Si esa celda se
    // leyera como la fórmula en vez de como su resultado vacío, cada una
    // aparecería como una fila con datos.
    const m = await matriz();
    const filaVacia = m[50] ?? [];
    expect(filaVacia[8]).toBe("");
  });

  it("el piso nunca queda por encima del precio de venta", async () => {
    const m = await matriz();
    const { filas } = leerFilas(m, detectarCabecera(m)!);
    for (const f of filas) {
      expect(f.precio_minimo).toBeLessThanOrEqual(f.precio_venta);
    }
  });
});
