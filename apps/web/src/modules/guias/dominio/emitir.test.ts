import { describe, expect, it } from "vitest";

import { faltaParaEmitir } from "./emitir";

const base = {
  orden_compra_cliente: "OC-40505",
  modalidad_traslado: "02" as const,
  a_pie: false,
  transportista_documento: null,
  transportista_placa: "AUE169",
  conductor_documento: "09655141",
  peso_bruto_kg: 5,
  lineas: [{ id: "1" }] as never[],
};

describe("lo que falta para emitir una guía (14/10)", () => {
  it("completa, no falta nada", () => {
    expect(faltaParaEmitir(base)).toEqual([]);
  });

  it("sin orden de compra no se emite", () => {
    expect(faltaParaEmitir({ ...base, orden_compra_cliente: "  " })).toEqual(["la orden de compra del cliente"]);
  });

  it("a pie no pide placa, pide el DNI de quien la lleva", () => {
    expect(faltaParaEmitir({ ...base, a_pie: true, transportista_placa: null })).toEqual([]);
    expect(faltaParaEmitir({ ...base, a_pie: true, transportista_placa: null, conductor_documento: null })).toEqual([
      "el DNI de quien la lleva",
    ]);
  });

  it("por agencia pide su RUC", () => {
    expect(faltaParaEmitir({ ...base, modalidad_traslado: "01", transportista_placa: null })).toEqual(["el RUC de la agencia"]);
  });
});
