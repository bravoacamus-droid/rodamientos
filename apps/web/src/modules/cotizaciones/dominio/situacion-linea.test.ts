import { describe, expect, it } from "vitest";

import { resumirSituaciones, saleDelAlmacen, situacionDeLinea, type LineaParaSituacion } from "./situacion-linea";

const base: LineaParaSituacion = {
  productoId: "p1",
  esKit: false,
  necesita: 24,
  stock: 0,
  analizada: false,
  comprarIgual: false,
};

describe("situacionDeLinea", () => {
  it("sin stock ni análisis: falta analizar", () => {
    expect(situacionDeLinea(base)).toBe("falta_analizar");
  });

  it("con algo de stock que no alcanza: parcial", () => {
    expect(situacionDeLinea({ ...base, stock: 4 })).toBe("parcial");
  });

  it("analizada y sin stock: se compra", () => {
    expect(situacionDeLinea({ ...base, analizada: true })).toBe("comprar");
  });

  it("el caso del 04/11: analizada sin stock, y luego llegó la mercadería", () => {
    // Las 24 fajas entraron con la OC02-00005: el análisis queda de referencia.
    expect(situacionDeLinea({ ...base, analizada: true, stock: 24 })).toBe("almacen_con_analisis");
  });

  it("con «Comprar igual» se compra aunque el almacén alcance", () => {
    expect(situacionDeLinea({ ...base, analizada: true, stock: 24, comprarIgual: true })).toBe("comprar");
  });

  it("el almacén alcanza y no hay análisis", () => {
    expect(situacionDeLinea({ ...base, stock: 30 })).toBe("almacen");
  });

  it("kits, líneas libres y lo ya entregado no aplican", () => {
    expect(situacionDeLinea({ ...base, esKit: true })).toBe("no_aplica");
    expect(situacionDeLinea({ ...base, productoId: null })).toBe("no_aplica");
    expect(situacionDeLinea({ ...base, necesita: 0 })).toBe("no_aplica");
  });
});

describe("saleDelAlmacen", () => {
  it("solo si alcanza entero y no se pidió comprar", () => {
    expect(saleDelAlmacen({ ...base, stock: 24 })).toBe(true);
    expect(saleDelAlmacen({ ...base, stock: 23 })).toBe(false);
    expect(saleDelAlmacen({ ...base, stock: 24, comprarIgual: true })).toBe(false);
    expect(saleDelAlmacen({ ...base, stock: 24, necesita: 0 })).toBe(false);
  });
});

describe("resumirSituaciones", () => {
  it("cuenta almacén, compra y lo que falta analizar", () => {
    expect(
      resumirSituaciones(["almacen", "almacen_con_analisis", "comprar", "parcial", "falta_analizar", "no_aplica"]),
    ).toEqual({ almacen: 2, comprar: 1, faltaAnalizar: 2 });
  });
});
