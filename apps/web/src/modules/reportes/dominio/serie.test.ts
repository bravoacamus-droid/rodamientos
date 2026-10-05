import { describe, expect, it } from "vitest";

import { inicioDePeriodo, rellenarPeriodos } from "./serie";

const vacio = (periodo: string) => ({ periodo, venta: 0 });

describe("inicioDePeriodo", () => {
  it("la semana empieza en lunes, como date_trunc", () => {
    // 2026-08-01 es sábado → lunes 2026-07-27
    expect(inicioDePeriodo("2026-08-01", "semana")).toBe("2026-07-27");
    expect(inicioDePeriodo("2026-08-03", "semana")).toBe("2026-08-03");
  });
  it("mes y año", () => {
    expect(inicioDePeriodo("2026-10-05", "mes")).toBe("2026-10-01");
    expect(inicioDePeriodo("2026-10-05", "anio")).toBe("2026-01-01");
  });
});

describe("rellenarPeriodos", () => {
  it("rellena los días sin venta entre medias", () => {
    const r = rellenarPeriodos(
      [
        { periodo: "2026-08-01", venta: 10 },
        { periodo: "2026-08-04", venta: 5 },
      ],
      "2026-08-04",
      "dia",
      vacio,
    );
    expect(r.map((p) => p.periodo)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
    expect(r.map((p) => p.venta)).toEqual([10, 0, 0, 5]);
  });

  it("llega hasta el final del rango aunque no haya ventas al final", () => {
    const r = rellenarPeriodos(
      [{ periodo: "2026-07-01", venta: 3 }, { periodo: "2026-08-01", venta: 4 }],
      "2026-10-05",
      "mes",
      vacio,
    );
    expect(r.map((p) => p.periodo)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("no rellena por delante del primer dato", () => {
    const r = rellenarPeriodos([{ periodo: "2024-01-01", venta: 1 }], "2026-10-05", "anio", vacio);
    expect(r.map((p) => p.periodo)).toEqual(["2024-01-01", "2025-01-01", "2026-01-01"]);
  });

  it("sin datos, sin serie", () => {
    expect(rellenarPeriodos([], "2026-10-05", "mes", vacio)).toEqual([]);
  });

  it("acepta el periodo con hora y respeta el orden", () => {
    const r = rellenarPeriodos(
      [
        { periodo: "2026-08-10T00:00:00", venta: 2 },
        { periodo: "2026-07-27", venta: 1 },
      ],
      "2026-08-12",
      "semana",
      vacio,
    );
    expect(r.map((p) => p.venta)).toEqual([1, 0, 2]);
  });

  it("tiene tope", () => {
    const r = rellenarPeriodos([{ periodo: "2000-01-01", venta: 1 }], "2026-01-01", "dia", vacio);
    expect(r.length).toBe(400);
  });
});
