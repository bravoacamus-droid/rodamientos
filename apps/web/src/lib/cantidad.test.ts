import { describe, expect, it } from "vitest";

import { admiteDecimales, ajustarCantidad, cantidadValidaPara, mensajeCantidadEntera, pasoCantidad } from "./cantidad";

describe("cantidades con decimales según la unidad (16/11)", () => {
  it("lo que se mide admite decimales; lo que se cuenta por pieza, no", () => {
    expect(admiteDecimales("MTR")).toBe(true);
    expect(admiteDecimales("kgm")).toBe(true);
    expect(admiteDecimales("CEN")).toBe(true);
    expect(admiteDecimales("NIU")).toBe(false);
    expect(admiteDecimales("KT")).toBe(false);
    expect(admiteDecimales(null)).toBe(false);
  });

  it("el paso del campo", () => {
    expect(pasoCantidad("MTR")).toBe(0.01);
    expect(pasoCantidad("NIU")).toBe(1);
  });

  it("ajusta a dos decimales o a entero, y nunca negativa", () => {
    expect(ajustarCantidad(3.5, "MTR")).toBe(3.5);
    expect(ajustarCantidad(2.987, "MTR")).toBe(2.99);
    expect(ajustarCantidad(3.5, "NIU")).toBe(4);
    expect(ajustarCantidad(-2, "MTR")).toBe(0);
    expect(ajustarCantidad(Number.NaN, "NIU")).toBe(0);
  });

  it("valida en el servidor", () => {
    expect(cantidadValidaPara(2.98, "MTR")).toBe(true);
    expect(cantidadValidaPara(2.985, "MTR")).toBe(false);
    expect(cantidadValidaPara(3, "NIU")).toBe(true);
    expect(cantidadValidaPara(1.5, "NIU")).toBe(false);
  });

  it("la frase dice el código y la salida", () => {
    expect(mensajeCantidadEntera("6205ZZ", 1.5)).toContain("6205ZZ se vende por pieza");
    expect(mensajeCantidadEntera("6205ZZ", 1.5)).toContain("cambia su unidad en la ficha");
  });
});
