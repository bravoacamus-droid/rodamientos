import { describe, expect, it } from "vitest";

import { cursorDe, filtroCursor } from "./orden-reciente";

describe("el orden de las listas: fecha, hora y número", () => {
  const cursor = cursorDe({ fecha: "2026-10-09", creado: "2026-10-09 14:56:16.98+00", numero: "COT1-000007" });

  it("el cursor lleva las tres claves y se vuelve filtro", () => {
    expect(cursor).toBe("2026-10-09|2026-10-09 14:56:16.98+00|COT1-000007");
    expect(filtroCursor(cursor ?? undefined, false, "fecha")).toBe(
      'fecha.lt.2026-10-09,and(fecha.eq.2026-10-09,creado_en.lt."2026-10-09 14:56:16.98+00"),' +
        'and(fecha.eq.2026-10-09,creado_en.eq."2026-10-09 14:56:16.98+00",numero.lt.COT1-000007)',
    );
  });

  it("hacia atrás compara al revés", () => {
    expect(filtroCursor(cursor ?? undefined, true, "fecha_emision")).toMatch(/^fecha_emision\.gt\./);
  });

  it("un cursor viejo (solo el número) o manipulado no filtra", () => {
    expect(filtroCursor("CT02-001261", false, "fecha")).toBeNull();
    expect(filtroCursor("2026-10-09|x),id.gt.0|COT1", false, "fecha")).toBeNull();
    expect(filtroCursor(undefined, false, "fecha")).toBeNull();
  });
});
