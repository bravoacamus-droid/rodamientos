import { describe, expect, it } from "vitest";

import { margenDeLoFacturado } from "./margen";

describe("margenDeLoFacturado", () => {
  it("sin costo no hay margen", () => {
    expect(margenDeLoFacturado(1000, 0)).toEqual({ tipo: "sin_costo" });
  });

  it("el caso del 21/10: 132 mil vendidos contra 35 de costo es costo incompleto", () => {
    expect(margenDeLoFacturado(132_000, 35.39)).toEqual({ tipo: "incompleto" });
  });

  it("con el costo completo da el margen sobre el costo", () => {
    const m = margenDeLoFacturado(1300, 1000);
    expect(m.tipo).toBe("ok");
    expect(m.tipo === "ok" && m.pct).toBeCloseTo(30);
  });

  it("el borde: el costo justo en el 20 % de lo vendido todavía se cree", () => {
    expect(margenDeLoFacturado(1000, 200).tipo).toBe("ok");
  });
});
