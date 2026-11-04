import { describe, expect, it } from "vitest";

import { direccionEnDos } from "./direccion-en-dos";

describe("direccionEnDos", () => {
  it("parte la de Rodatech en la coma de en medio", () => {
    expect(
      direccionEnDos("JR. LOS HUERTOS 2232, URB. SAN HILARION 1RA ETAPA, SAN JUAN DE LURIGANCHO, LIMA - LIMA"),
    ).toEqual(["JR. LOS HUERTOS 2232, URB. SAN HILARION 1RA ETAPA,", "SAN JUAN DE LURIGANCHO, LIMA - LIMA"]);
  });

  it("sin comas va entera", () => {
    expect(direccionEnDos("AV. ARGENTINA 123 LIMA")).toEqual(["AV. ARGENTINA 123 LIMA"]);
  });

  it("no deja un renglón de dos palabras", () => {
    expect(direccionEnDos("A, AV. NESTOR GAMBETTA 6448 ZONA INDUSTRIAL CALLAO")).toEqual([
      "A, AV. NESTOR GAMBETTA 6448 ZONA INDUSTRIAL CALLAO",
    ]);
  });

  it("vacía no da renglones", () => {
    expect(direccionEnDos(null)).toEqual([]);
    expect(direccionEnDos("  ")).toEqual([]);
  });
});
