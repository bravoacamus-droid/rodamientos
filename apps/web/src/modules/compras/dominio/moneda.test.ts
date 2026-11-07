import { describe, expect, it } from "vitest";

import { enDolares } from "./moneda";

describe("enDolares", () => {
  it("S/ 160 a 3.20 son US$ 50", () => {
    expect(enDolares(160, 3.2)).toBe(50);
  });
  it("redondea a céntimos", () => {
    expect(enDolares(100, 3.75)).toBe(26.67);
  });
  it("sin tipo de cambio no inventa uno", () => {
    expect(enDolares(160, 0)).toBe(160);
  });
});
