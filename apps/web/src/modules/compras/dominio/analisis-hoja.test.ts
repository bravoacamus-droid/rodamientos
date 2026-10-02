import { describe, expect, it } from "vitest";

import { leerHojaAnalisis, numeroDeTexto } from "./analisis-hoja";

/*
  La forma de su hoja (columnas A–R con sus títulos literales y el bloque de
  DHL debajo), con datos inventados: los de Willy no van al repositorio.
*/
const TITULOS = [
  "CLIENTE", "f", "CODIGO", "MARCA", "CANT.Ref", "Price FOB $", "PARC.$", "PESO U(Kg.)",
  "PESO PARC.", "CANT. PEDIDO", "$PARC", "PESO PED.(Kg)", "PU LIMA $", "TOT. $", "P.M",
  "TOT. PM", "PROV.", "%",
];
const fila = (cli: string, f: string, cod: string, marca: string, ref: string, fob: string, peso: string, ped: string, pm: string, prov: string) =>
  [cli, f, cod, marca, ref, fob, "", peso, "", ped, "", "", "", "", pm, "", prov, ""];

const hoja = [
  TITULOS,
  fila("ACME", "4", "abc 123", "skf", "6", "3.144", "0.617", "6", "23.78", "OMNI"),
  fila("ACME", "2", "XYZ-9", "INA", "20", "0.393", "0.00454", "10", "2.063", "SUD"),
  ["", "", "", "", "", "", "945.32", "", "102.3", "26", "", "", "", "", "", "", "", ""],
  [],
  ["", "", "", "", "CANT. REF", "CANT. PEDIDO"],
  ["", "", "", "TOT. FOB $", "945.32", "611.115"],
  ["", "", "", "DHL $", "1039", "668.80"],
];

describe("leer su hoja", () => {
  it("lee las filas por el NOMBRE de las columnas y se para en la de totales", () => {
    const r = leerHojaAnalisis(hoja);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({
      fila: 2,
      cliente: "ACME",
      frecuencia: 4,
      codigo: "ABC 123",
      marca: "SKF",
      cantidadRef: 6,
      precioFob: 3.144, // con sus cuatro decimales, no el $3.14 que se ve
      pesoKg: 0.617,
      cantidadPedido: 6,
      precioMercado: 23.78,
      proveedorMercado: "OMNI",
    });
    expect(r.filas[1]!.pesoKg).toBe(0.00454);
  });

  it("encuentra el DHL de la carga cotizada en el bloque de abajo", () => {
    expect(leerHojaAnalisis(hoja).costoEnvio).toBe(1039);
  });

  it("aguanta que se muevan las columnas", () => {
    const orden = [5, 2, 4, 7, 9, 0];
    const movida = hoja.slice(0, 3).map((f) => orden.map((i) => f[i] ?? ""));
    const r = leerHojaAnalisis(movida);
    expect(r.filas[0]).toMatchObject({ codigo: "ABC 123", precioFob: 3.144, pesoKg: 0.617, cantidadPedido: 6, cliente: "ACME" });
  });

  it("sin la columna de pedido, se pide lo cotizado", () => {
    const r = leerHojaAnalisis([
      ["CODIGO", "CANT.Ref", "Price FOB $", "PESO U(Kg.)"],
      ["A1", "7", "2", "1"],
    ]);
    expect(r.filas[0]!.cantidadPedido).toBe(7);
  });

  it("dice qué columna falta y qué filas no tienen peso", () => {
    expect(leerHojaAnalisis([["CODIGO", "Price FOB $"], ["A", "1"]]).problemas[0]).toContain("CANT.Ref");
    const r = leerHojaAnalisis([
      ["CODIGO", "CANT.Ref", "Price FOB $", "PESO U(Kg.)"],
      ["A1", "1", "2", ""],
    ]);
    expect(r.problemas.join(" ")).toContain("A1");
    expect(r.problemas.join(" ")).toContain("DHL");
  });

  it("sin títulos, no inventa nada", () => {
    const r = leerHojaAnalisis([["a", "b"], ["1", "2"]]);
    expect(r.filas).toHaveLength(0);
    expect(r.problemas[0]).toContain("títulos");
  });
});

describe("números como los escribe una persona", () => {
  it.each([
    ["$ 1,039.00", 1039],
    ["3.144", 3.144],
    ["0,005", 0.005],
    ["1.039,50", 1039.5],
    ["US$ 12", 12],
    ["", 0],
    ["abc", 0],
    ["-5", 0],
  ])("«%s» → %s", (t, n) => {
    expect(numeroDeTexto(t)).toBe(n);
  });
});

describe("los títulos con asterisco del Excel que exporta el ERP", () => {
  it("se reconocen igual", () => {
    const r = leerHojaAnalisis([
      ["CLIENTE *", "CODIGO *", "CANT.Ref *", "Price FOB $ *", "PESO U(Kg.) *", "CANT. PEDIDO *"],
      ["ACME", "A1", "3", "2.5", "1", "2"],
    ]);
    expect(r.filas[0]).toMatchObject({ cliente: "ACME", codigo: "A1", cantidadRef: 3, precioFob: 2.5, pesoKg: 1, cantidadPedido: 2 });
  });
});
