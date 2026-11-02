import { describe, expect, it } from "vitest";

import { faltaAnalizarAlAprobar, mensajeFaltaAnalisis, type LineaAlAprobar } from "./analisis-al-aprobar";

const linea = (campos: Partial<LineaAlAprobar> = {}): LineaAlAprobar => ({
  codigo: "6205ZZ/2AU1",
  productoId: "p1",
  esKit: false,
  confirmada: 20,
  disponible: 0,
  analizada: false,
  ...campos,
});

describe("el análisis de compra al aprobar (02/11)", () => {
  it("lo que hay que comprar y no se analizó, no deja aprobar", () => {
    expect(faltaAnalizarAlAprobar([linea()])).toEqual(["6205ZZ/2AU1"]);
  });

  it("analizado, pasa", () => {
    expect(faltaAnalizarAlAprobar([linea({ analizada: true })])).toEqual([]);
  });

  it("lo que está en el anaquel no se compra: no se pide", () => {
    expect(faltaAnalizarAlAprobar([linea({ disponible: 20 })])).toEqual([]);
    // Si falta aunque sea uno, sí.
    expect(faltaAnalizarAlAprobar([linea({ disponible: 19 })])).toEqual(["6205ZZ/2AU1"]);
  });

  it("las líneas que el cliente no confirmó, los kits y las líneas libres no cuentan", () => {
    expect(
      faltaAnalizarAlAprobar([
        linea({ codigo: "A", confirmada: 0 }),
        linea({ codigo: "B", esKit: true }),
        linea({ codigo: "C", productoId: null }),
        linea({ codigo: "D" }),
      ]),
    ).toEqual(["D"]);
  });

  it("el mensaje dice cuáles", () => {
    expect(mensajeFaltaAnalisis(["A"])).toContain("de A");
    expect(mensajeFaltaAnalisis(["A", "B"])).toContain("(A, B)");
  });
});
