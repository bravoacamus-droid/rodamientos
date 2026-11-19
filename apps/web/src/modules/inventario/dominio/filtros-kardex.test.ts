import { describe, expect, it } from "vitest";

import { describirFiltros, filtrosAQuery, hayFiltros, leerFiltrosKardex, rangoLima } from "./filtros-kardex";

const ID = "11111111-1111-4111-8111-111111111111";

describe("filtros del kardex (19/11)", () => {
  it("lee lo válido e ignora lo que no lo es", () => {
    const f = leerFiltrosKardex({
      familia: ID,
      marca: "no-es-uuid",
      tipo: "salida",
      referencia: "loquesea",
      desde: "2026-11-01",
      hasta: "01/11/2026",
      q: "  6205, (skf)  ",
    });
    expect(f).toMatchObject({ familia: ID, tipo: "salida", desde: "2026-11-01", q: "6205 skf" });
    expect(f.marca).toBeUndefined();
    expect(f.referencia).toBeUndefined();
    expect(f.hasta).toBeUndefined();
  });

  it("lee igual de un URLSearchParams, que es lo que reciben las rutas de Excel y PDF", () => {
    const f = leerFiltrosKardex(new URLSearchParams(`producto=${ID}&tipo=ingreso`));
    expect(f).toMatchObject({ producto: ID, tipo: "ingreso" });
    expect(hayFiltros(f)).toBe(true);
    expect(hayFiltros(leerFiltrosKardex({}))).toBe(false);
  });

  it("ida y vuelta por la query string", () => {
    const f = leerFiltrosKardex({ subfamilia: ID, referencia: "guia", q: "T002" });
    expect(leerFiltrosKardex(new URLSearchParams(filtrosAQuery(f)))).toEqual(f);
  });

  it("el periodo es el día de Lima, no el de Greenwich", () => {
    expect(rangoLima("2026-11-01", "2026-11-30")).toEqual({
      desde: "2026-11-01T00:00:00-05:00",
      hasta: "2026-11-30T23:59:59.999-05:00",
    });
  });

  it("describe en palabras lo filtrado", () => {
    const f = leerFiltrosKardex({ desde: "2026-11-01", hasta: "2026-11-19", tipo: "salida" });
    expect(describirFiltros(f, { familia: "Rodamientos" })).toBe(
      "Del 01/11/2026 al 19/11/2026 · familia Rodamientos · Salida",
    );
  });
});
