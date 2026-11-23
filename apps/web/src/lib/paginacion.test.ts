import { describe, expect, it } from "vitest";

import { leerFilasPorPagina, leerPagina, totalPaginas, ventanaPaginas } from "./paginacion";

describe("páginas numeradas", () => {
  it("solo acepta los tamaños del selector", () => {
    expect(leerFilasPorPagina("30")).toBe(30);
    expect(leerFilasPorPagina("10")).toBe(10);
    expect(leerFilasPorPagina("100000")).toBe(15);
    expect(leerFilasPorPagina(undefined)).toBe(15);
    expect(leerFilasPorPagina(["50", "10"])).toBe(50);
  });

  it("la página es un entero desde 1", () => {
    expect(leerPagina("3")).toBe(3);
    expect(leerPagina("0")).toBe(1);
    expect(leerPagina("-2")).toBe(1);
    expect(leerPagina("2.5")).toBe(1);
    expect(leerPagina("abc")).toBe(1);
    expect(leerPagina(undefined)).toBe(1);
  });

  it("cuenta las páginas, y una vacía es una", () => {
    expect(totalPaginas(0, 15)).toBe(1);
    expect(totalPaginas(15, 15)).toBe(1);
    expect(totalPaginas(16, 15)).toBe(2);
  });

  it("pinta la primera, la última y las de alrededor", () => {
    expect(ventanaPaginas(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(ventanaPaginas(1, 20)).toEqual([1, 2, 3, 4, "…", 20]);
    expect(ventanaPaginas(3, 20)).toEqual([1, 2, 3, 4, "…", 20]);
    expect(ventanaPaginas(4, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
    expect(ventanaPaginas(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(ventanaPaginas(18, 20)).toEqual([1, "…", 17, 18, 19, 20]);
    expect(ventanaPaginas(20, 20)).toEqual([1, "…", 17, 18, 19, 20]);
    expect(ventanaPaginas(99, 8)).toEqual([1, "…", 5, 6, 7, 8]);
  });
});
