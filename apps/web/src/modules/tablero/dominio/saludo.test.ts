import { describe, expect, it } from "vitest";

import { nombreDePila, saludoPorHora } from "./saludo";

describe("saludoPorHora", () => {
  it("cambia a las 12 y a las 19", () => {
    expect(saludoPorHora(8)).toBe("Buenos días");
    expect(saludoPorHora(11)).toBe("Buenos días");
    expect(saludoPorHora(12)).toBe("Buenas tardes");
    expect(saludoPorHora(18)).toBe("Buenas tardes");
    expect(saludoPorHora(19)).toBe("Buenas noches");
  });

  it("de madrugada es de noche", () => {
    expect(saludoPorHora(0)).toBe("Buenas noches");
    expect(saludoPorHora(4)).toBe("Buenas noches");
  });
});

describe("nombreDePila", () => {
  it("toma el primer nombre y le quita las mayúsculas", () => {
    expect(nombreDePila("GIUSEPPE CALLE")).toBe("Giuseppe");
    expect(nombreDePila("  willy   fernández ")).toBe("Willy");
    expect(nombreDePila("ÁNGEL")).toBe("Ángel");
  });

  it("sin nombre, nada", () => {
    expect(nombreDePila(null)).toBe("");
    expect(nombreDePila("   ")).toBe("");
  });
});
