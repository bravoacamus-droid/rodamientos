import { describe, expect, it } from "vitest";

import { contarConsultas, nivelDeUso } from "./consultas-externas";

describe("contarConsultas", () => {
  it("separa lo pedido a Decolecta de lo respondido de memoria, por tipo", () => {
    const r = contarConsultas([
      { endpoint: "sunat/ruc", desde_cache: false, status_code: 200 },
      { endpoint: "sunat/ruc", desde_cache: true, status_code: null },
      { endpoint: "tipo-cambio/sunat", desde_cache: true, status_code: null },
      { endpoint: "tipo-cambio/sunat", desde_cache: true, status_code: null },
      { endpoint: "reniec/dni", desde_cache: false, status_code: 404 },
      { endpoint: "otra/cosa", desde_cache: false, status_code: 200 },
    ]);
    expect(r).toEqual([
      { tipo: "ruc", pedidas: 1, deMemoria: 1 },
      { tipo: "dni", pedidas: 1, deMemoria: 0 },
      { tipo: "tipo_cambio", pedidas: 0, deMemoria: 2 },
    ]);
  });

  it("sin filas salen los tres tipos en cero", () => {
    expect(contarConsultas([]).map((c) => c.pedidas + c.deMemoria)).toEqual([0, 0, 0]);
  });
});

describe("nivelDeUso", () => {
  it("usa los umbrales 75 y 90", () => {
    expect(nivelDeUso(52, 100)).toBe("bien");
    expect(nivelDeUso(75, 100)).toBe("atento");
    expect(nivelDeUso(90, 100)).toBe("casi");
    expect(nivelDeUso(0, 0)).toBe("casi");
  });
});
