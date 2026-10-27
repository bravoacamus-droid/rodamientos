import { describe, expect, it } from "vitest";

import { avisoDelNumero, avisoEliminada, leerPrevia } from "./eliminar";

describe("leerPrevia", () => {
  it("lee la última de la serie con el número que vuelve", () => {
    expect(
      leerPrevia({ numero: "COT1-000010", motivo: null, ultima: true, siguiente: "COT1-000010" }),
    ).toEqual({ numero: "COT1-000010", motivo: null, ultima: true, siguiente: "COT1-000010" });
  });

  it("una de en medio no trae siguiente aunque venga algo", () => {
    expect(leerPrevia({ numero: "CT02-001200", ultima: false, siguiente: "CT02-001200" })?.siguiente).toBeNull();
  });

  it("guarda el motivo cuando no se puede", () => {
    const p = leerPrevia({ numero: "CT02-001261", motivo: "Tiene el pedido PED-26-00005; anúlala en vez de eliminarla.", ultima: true, siguiente: "CT02-001261" });
    expect(p?.motivo).toMatch(/^Tiene el pedido PED-26-00005/);
  });

  it("descarta respuestas sin número", () => {
    expect(leerPrevia(null)).toBeNull();
    expect(leerPrevia({ ultima: true })).toBeNull();
    expect(leerPrevia("COT1-000001")).toBeNull();
  });
});

describe("avisoDelNumero", () => {
  it("si es la última, dice qué número saldrá", () => {
    expect(
      avisoDelNumero({ numero: "COT1-000010", motivo: null, ultima: true, siguiente: "COT1-000010" }),
    ).toBe("La próxima cotización volverá a ser la COT1-000010.");
  });

  it("si no es la última, dice que el número no se vuelve a usar", () => {
    expect(avisoDelNumero({ numero: "COT1-000005", motivo: null, ultima: false, siguiente: null })).toMatch(
      /^El número COT1-000005 no se volverá a usar/,
    );
  });
});

describe("avisoEliminada", () => {
  it("dice la próxima o el número perdido", () => {
    expect(avisoEliminada({ numero: "CT02-001261", ultima: true, siguiente: "CT02-001261" })).toBe(
      "La próxima cotización será la CT02-001261.",
    );
    expect(avisoEliminada({ numero: "CT02-001200", ultima: false, siguiente: null })).toBe(
      "El número CT02-001200 queda sin usar.",
    );
  });
});
