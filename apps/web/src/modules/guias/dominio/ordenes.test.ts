import { describe, expect, it } from "vitest";

import { distintas, sugerenciasPara } from "./ordenes";

describe("la orden de compra del cliente (14/10)", () => {
  it("las ya usadas, sin repetir ni vacías", () => {
    expect(distintas(["OC-345", " oc-345 ", null, "", "2026-000-347"])).toEqual(["OC-345", "2026-000-347"]);
  });

  it("sugiere las que coinciden con lo tecleado y no la que ya está puesta", () => {
    const usadas = ["OC-345", "OC-346", "2026-000-347"];
    expect(sugerenciasPara(usadas, "")).toEqual(usadas);
    expect(sugerenciasPara(usadas, "347")).toEqual(["2026-000-347"]);
    expect(sugerenciasPara(usadas, "oc-345")).toEqual([]);
  });
});
