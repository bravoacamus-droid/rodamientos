import { describe, expect, it } from "vitest";

import { PREFERENCIAS_POR_DEFECTO, atributosHtml, leerPreferencias, serializar } from "./accesibilidad";

describe("preferencias de accesibilidad", () => {
  it("lo normal no escribe nada", () => {
    expect(serializar(PREFERENCIAS_POR_DEFECTO)).toBe("");
    expect(atributosHtml(PREFERENCIAS_POR_DEFECTO)).toEqual({
      "data-letra": undefined,
      "data-contraste": undefined,
      "data-movimiento": undefined,
    });
  });

  it("va y vuelve sin perder nada", () => {
    const p = { letra: "muy-grande", contrasteAlto: true, sinMovimiento: true } as const;
    expect(serializar(p)).toBe("letra:muy-grande|contraste:alto|movimiento:no");
    expect(leerPreferencias(serializar(p))).toEqual(p);
  });

  it("una cookie rota o vieja no rompe nada: queda lo normal", () => {
    expect(leerPreferencias(undefined)).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(leerPreferencias("letra:gigante|basura|:")).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(leerPreferencias("contraste:alto|otra:cosa")).toEqual({ ...PREFERENCIAS_POR_DEFECTO, contrasteAlto: true });
  });

  it("pone en el html solo lo que no es lo normal", () => {
    expect(atributosHtml({ letra: "grande", contrasteAlto: false, sinMovimiento: true })).toEqual({
      "data-letra": "grande",
      "data-contraste": undefined,
      "data-movimiento": "reducido",
    });
  });
});
