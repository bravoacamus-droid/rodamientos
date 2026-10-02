import { describe, expect, it } from "vitest";

import { leerHojaAnalisis } from "../dominio/analisis-hoja";
import { valorCelda } from "@/modules/importacion/api/hoja";
import { libroAnalisis, TITULOS_HOJA, type DatosExcelAnalisis } from "./analisis-excel";

/* Datos inventados: los de Willy no van al repositorio. */
const DATOS: DatosExcelAnalisis = {
  numero: "ANA-26-00007",
  proveedor: "PROVEEDOR DE PRUEBA",
  referencia: "PI-123",
  fecha: "2026-10-02",
  costoEnvio: 500,
  desaduanajeSoles: 750,
  tipoCambio: 3.75,
  lineas: [
    {
      cliente: "ACME",
      frecuencia: 4,
      codigo: "ABC 123",
      marca: "SKF",
      cantidadRef: 6,
      precioFob: 3.144,
      pesoKg: 0.617,
      cantidadPedido: 6,
      precioMercado: 23.78,
      proveedorMercado: "OMNI",
    },
    {
      cliente: "",
      frecuencia: null,
      codigo: "XYZ-9",
      marca: "",
      cantidadRef: 20,
      precioFob: 0.393,
      pesoKg: 0.00454,
      cantidadPedido: 10,
      precioMercado: 0,
      proveedorMercado: "",
    },
  ],
};

async function abrir(d: DatosExcelAnalisis) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await libroAnalisis(d)) as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

/** Busca la fila del bloque de abajo por su etiqueta en la columna D. */
function filaDe(ws: Awaited<ReturnType<typeof abrir>>, etiqueta: string): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    const v = ws.getCell(`D${r}`).value as { richText?: { text: string }[] } | string | null;
    const t = typeof v === "object" && v?.richText ? v.richText.map((x) => x.text).join("") : v;
    if (t === etiqueta || t === `${etiqueta} *`) return r;
  }
  throw new Error(`no está «${etiqueta}»`);
}

const formula = (v: unknown) => (v as { formula?: string } | null)?.formula ?? null;

describe("el análisis, a su hoja de Excel", () => {
  it("lleva sus títulos, literales y en su orden (con « *» en los que se escriben)", async () => {
    const ws = await abrir(DATOS);
    const textos = (ws.getRow(1).values as unknown[])
      .slice(1)
      .map((v) => (v as { richText?: { text: string }[] }).richText?.map((t) => t.text).join("") ?? v);
    expect(textos.map((t) => String(t).replace(/ \*$/, ""))).toEqual([...TITULOS_HOJA]);
  });

  it("las filas llevan los datos y FÓRMULAS, no números pegados", async () => {
    const ws = await abrir(DATOS);
    expect(ws.getCell("C2").value).toBe("ABC 123");
    expect(ws.getCell("F2").value).toBe(3.144);
    expect(formula(ws.getCell("G2").value)).toBe("E2*F2");
    expect(formula(ws.getCell("N3").value)).toBe("M3*J3");
    // Sin precio de mercado, el «%» queda vacío en vez de dividir entre cero.
    expect(formula(ws.getCell("R3").value)).toBe('IF(O3>0,O3/M3,"")');
  });

  it("el PU LIMA apunta a UNA celda de $/kg, cortado a dos decimales como su 10.15", async () => {
    const ws = await abrir(DATOS);
    const kg = filaDe(ws, "$/Kg.");
    expect(formula(ws.getCell("M2").value)).toBe(`F2+$E$${kg}*H2`);
    const dhl = filaDe(ws, "DHL $");
    const wTot = filaDe(ws, "W. TOT (Kg)");
    expect(formula(ws.getCell(`E${kg}`).value)).toBe(
      `IF(E${wTot}>0,ROUNDDOWN((E${dhl}+E${filaDe(ws, "DESADUANAJE $")})/E${wTot},2),0)`,
    );
  });

  it("la K lleva el desaduanaje: TOT. PM ÷ costo total", async () => {
    const ws = await abrir(DATOS);
    const k = filaDe(ws, "K");
    const costo = filaDe(ws, "COSTO TOTAL $");
    const pm = filaDe(ws, "TOT. PM $");
    expect(formula(ws.getCell(`F${k}`).value)).toBe(`IF(F${costo}>0,F${pm}/F${costo},"")`);
    expect(ws.getCell(`E${filaDe(ws, "DESADUANAJE S/")}`).value).toBe(750);
    expect(ws.getCell(`E${filaDe(ws, "TIPO DE CAMBIO")}`).value).toBe(3.75);
  });

  it("ida y vuelta: lo exportado se vuelve a leer con «Traer de un Excel» igual", async () => {
    const ws = await abrir(DATOS);
    const matriz: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (fila, n) => {
      const celdas: string[] = [];
      for (let c = 1; c <= 18; c++) celdas.push(valorCelda(fila.getCell(c).value));
      matriz[n - 1] = celdas;
    });
    for (let i = 0; i < matriz.length; i++) matriz[i] ??= [];
    const r = leerHojaAnalisis(matriz);
    expect(r.costoEnvio).toBe(500);
    expect(
      r.filas.map((f) => [f.codigo, f.cantidadRef, f.precioFob, f.pesoKg, f.cantidadPedido]),
    ).toEqual([
      ["ABC 123", 6, 3.144, 0.617, 6],
      ["XYZ-9", 20, 0.393, 0.00454, 10],
    ]);
    expect(r.filas[0]).toMatchObject({
      cliente: "ACME",
      frecuencia: 4,
      precioMercado: 23.78,
      proveedorMercado: "OMNI",
    });
  });
});

describe("el asterisco rojo de lo que se escribe (Willy, 02/10)", () => {
  const texto = (v: unknown) =>
    (v as { richText?: { text: string }[] } | null)?.richText?.map((t) => t.text).join("") ??
    String(v);

  it("las columnas de entrada llevan « *» y las calculadas no", async () => {
    const ws = await abrir(DATOS);
    expect(texto(ws.getCell("F1").value)).toBe("Price FOB $ *");
    expect(texto(ws.getCell("J1").value)).toBe("CANT. PEDIDO *");
    expect(texto(ws.getCell("M1").value)).toBe("PU LIMA $");
    expect(texto(ws.getCell("G1").value)).toBe("PARC.$");
  });

  it("el DHL, el desaduanaje y el tipo de cambio también, y hay leyenda", async () => {
    const ws = await abrir(DATOS);
    const etiquetas: string[] = [];
    ws.eachRow((fila) => etiquetas.push(texto(fila.getCell("D").value)));
    expect(etiquetas).toEqual(
      expect.arrayContaining(["DHL $ *", "DESADUANAJE S/ *", "TIPO DE CAMBIO *"]),
    );
    expect(etiquetas.some((e) => e.startsWith("* Lo escribe usted"))).toBe(true);
  });
});
