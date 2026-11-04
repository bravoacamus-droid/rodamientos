import { describe, expect, it } from "vitest";

import { estadoUtilidad, REGLA_UTILIDAD_POR_DEFECTO as R, utilidadMinima } from "./utilidad-minima";

describe("utilidadMinima (Willy, 04/11)", () => {
  it("con USD 100 de venta, 20", () => {
    expect(utilidadMinima(100, R)).toBe(20);
  });
  it("si es más, aumenta: con 500, 100", () => {
    expect(utilidadMinima(500, R)).toBe(100);
  });
  it("un negocio chico no baja del piso", () => {
    expect(utilidadMinima(40, R)).toBe(20);
  });
  it("sigue la regla de la empresa", () => {
    expect(utilidadMinima(1000, { minimoUsd: 30, porcentaje: 15 })).toBe(150);
  });
});

describe("estadoUtilidad", () => {
  it("la CT02-001313 (72.26 + 15.78, costo 59.24 + 12.90) no llega", () => {
    const e = estadoUtilidad(88.04, 72.14, R)!;
    expect(e.utilidad).toBe(15.9);
    expect(e.minima).toBe(20);
    expect(e.falta).toBe(4.1);
    expect(e.llega).toBe(false);
  });
  it("llega justo", () => {
    expect(estadoUtilidad(100, 80, R)!.llega).toBe(true);
  });
  it("vendiendo bajo el costo, falta la pérdida más el mínimo", () => {
    expect(estadoUtilidad(100, 110, R)!.falta).toBe(30);
  });
  it("sin costo no dice nada", () => {
    expect(estadoUtilidad(100, 0, R)).toBeNull();
  });
});
