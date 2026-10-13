import { describe, expect, it } from "vitest";

import { juntarOrdenes, partirOrdenes, sugerenciasPara } from "./ordenes";

describe("las órdenes de compra como lista (14/10)", () => {
  it("parte por comas, punto y coma o renglón, sin vacías ni repetidas", () => {
    expect(partirOrdenes("OC-345, oc-345 ; 346\n\n  2026-000-347  ")).toEqual(["OC-345", "346", "2026-000-347"]);
    expect(partirOrdenes(null)).toEqual([]);
  });

  it("se guarda como se imprime", () => {
    expect(juntarOrdenes(["OC-345", " 346 ", "OC-345"])).toBe("OC-345, 346");
    expect(juntarOrdenes([])).toBe("");
  });

  it("sugiere lo que no está puesto y coincide con lo tecleado", () => {
    const usadas = ["OC-345", "OC-346", "2026-000-347"];
    expect(sugerenciasPara(usadas, ["oc-345"], "")).toEqual(["OC-346", "2026-000-347"]);
    expect(sugerenciasPara(usadas, [], "347")).toEqual(["2026-000-347"]);
  });
});
