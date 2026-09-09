import { describe, expect, it } from "vitest";

import { periodoEnCurso } from "./periodo";

/**
 * De aquí sale si el último punto del gráfico lleva el aviso de «va a medias».
 *
 * Sin él, toda serie que llegue hasta hoy termina en una caída que no existe:
 * un mes de nueve días dibujado contra once meses enteros parece un desplome.
 * Y un gráfico se cree sin leer la letra pequeña.
 */
describe("periodoEnCurso", () => {
  const HOY = "2026-09-09";

  describe("por mes", () => {
    it("el mes de hoy va a medias", () => {
      // El caso del 09/09: septiembre llevaba nueve días.
      expect(periodoEnCurso("2026-09-01", "mes", HOY)).toBe(true);
    });

    it("el mes pasado está cerrado", () => {
      expect(periodoEnCurso("2026-08-01", "mes", HOY)).toBe(false);
    });

    it("no confunde el mismo mes de otro año", () => {
      expect(periodoEnCurso("2025-09-01", "mes", HOY)).toBe(false);
    });
  });

  describe("por día", () => {
    it("hoy va a medias: a las nueve de la mañana llevas una hora vendiendo", () => {
      expect(periodoEnCurso("2026-09-09", "dia", HOY)).toBe(true);
    });

    it("ayer está cerrado", () => {
      expect(periodoEnCurso("2026-09-08", "dia", HOY)).toBe(false);
    });
  });

  describe("por año", () => {
    it("el año de hoy va a medias", () => {
      expect(periodoEnCurso("2026-01-01", "anio", HOY)).toBe(true);
    });

    it("el año pasado está cerrado", () => {
      expect(periodoEnCurso("2025-01-01", "anio", HOY)).toBe(false);
    });
  });

  describe("por semana", () => {
    it("la semana que empezó hace tres días va a medias", () => {
      expect(periodoEnCurso("2026-09-07", "semana", HOY)).toBe(true);
    });

    it("la semana que empieza hoy también", () => {
      expect(periodoEnCurso("2026-09-09", "semana", HOY)).toBe(true);
    });

    it("la de hace ocho días está cerrada", () => {
      expect(periodoEnCurso("2026-09-01", "semana", HOY)).toBe(false);
    });

    it("cruza el fin de mes sin equivocarse", () => {
      // Del 31 de agosto al 2 de septiembre son dos días, no un mes: es el
      // caso que rompería una comparación por prefijo de texto.
      expect(periodoEnCurso("2026-08-31", "semana", "2026-09-02")).toBe(true);
      // Y del 20 de agosto al 2 de septiembre son trece: cerrada.
      expect(periodoEnCurso("2026-08-20", "semana", "2026-09-02")).toBe(false);
    });

    it("cruza el fin de año sin equivocarse", () => {
      expect(periodoEnCurso("2025-12-29", "semana", "2026-01-02")).toBe(true);
    });

    it("un periodo futuro no está «en curso»", () => {
      // No debería llegar nunca, pero devolver `true` pondría el aviso en un
      // punto que ni siquiera ha empezado.
      expect(periodoEnCurso("2026-09-20", "semana", HOY)).toBe(false);
    });
  });

  it("sin fecha no se afirma nada", () => {
    expect(periodoEnCurso("", "mes", HOY)).toBe(false);
    expect(periodoEnCurso("2026-09-01", "mes", "")).toBe(false);
  });
});
