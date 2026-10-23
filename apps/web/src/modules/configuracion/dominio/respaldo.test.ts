import { describe, expect, it } from "vitest";

import { estadoRespaldo, haceCuanto, type Respaldo } from "./respaldo";

const AHORA = new Date("2026-10-23T15:00:00-05:00");

function r(fecha: string, ok = true): Respaldo {
  return { fecha, ok, tablas: 71, filas: 28467, archivos: 1 };
}

describe("estadoRespaldo", () => {
  it("sin ninguna copia buena, lo dice", () => {
    expect(estadoRespaldo(null, null, AHORA)).toEqual({ nivel: "nunca" });
    expect(estadoRespaldo(null, r("2026-10-23T10:00:00-05:00", false), AHORA).nivel).toBe("nunca");
  });

  it("una copia de hoy está bien", () => {
    const e = estadoRespaldo(r("2026-10-23T09:00:00-05:00"), r("2026-10-23T09:00:00-05:00"), AHORA);
    expect(e).toMatchObject({ nivel: "bien", dias: 0, falloDespues: false });
  });

  it("siete días todavía está bien; ocho ya está atrasada", () => {
    expect(estadoRespaldo(r("2026-10-16T14:00:00-05:00"), null, AHORA)).toMatchObject({ nivel: "bien", dias: 7 });
    expect(estadoRespaldo(r("2026-10-15T14:00:00-05:00"), null, AHORA)).toMatchObject({ nivel: "atrasada", dias: 8 });
  });

  it("la del 07/10 —la que había antes de reescribir el script— sale atrasada", () => {
    expect(estadoRespaldo(r("2026-10-07T14:42:00-05:00"), null, AHORA).nivel).toBe("atrasada");
  });

  it("avisa si la última que se intentó falló", () => {
    const e = estadoRespaldo(r("2026-10-20T09:00:00-05:00"), r("2026-10-23T09:00:00-05:00", false), AHORA);
    expect(e).toMatchObject({ nivel: "bien", falloDespues: true });
  });

  it("un fallo ANTERIOR a la buena no cuenta", () => {
    const e = estadoRespaldo(r("2026-10-23T09:00:00-05:00"), r("2026-10-23T09:00:00-05:00"), AHORA);
    expect(e).toMatchObject({ falloDespues: false });
  });
});

describe("haceCuanto", () => {
  it("dice hoy, ayer o hace N días", () => {
    expect(haceCuanto(0)).toBe("hoy");
    expect(haceCuanto(1)).toBe("ayer");
    expect(haceCuanto(9)).toBe("hace 9 días");
  });
});
