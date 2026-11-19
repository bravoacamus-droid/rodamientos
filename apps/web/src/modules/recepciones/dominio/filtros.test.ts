import { describe, expect, it } from "vitest";

import {
  describirFiltrosRecepciones,
  filtrosRecepcionesAQuery,
  hayFiltrosRecepciones,
  leerFiltrosRecepciones,
} from "./filtros";

const ID = "11111111-1111-4111-8111-111111111111";

describe("filtros de recepciones (19/11)", () => {
  it("lee lo válido e ignora lo que no lo es", () => {
    const f = leerFiltrosRecepciones({
      proveedor: ID,
      marca: "skf",
      moneda: "EUR",
      estado: "anuladas",
      producto: " 6205,(2rs) ",
      hasta: "2026/11/19",
    });
    expect(f).toMatchObject({ proveedor: ID, estado: "anuladas", producto: "6205 2rs" });
    expect(f.marca).toBeUndefined();
    expect(f.moneda).toBeUndefined();
    expect(f.hasta).toBeUndefined();
    expect(hayFiltrosRecepciones(leerFiltrosRecepciones({}))).toBe(false);
  });

  it("ida y vuelta por la query string", () => {
    const f = leerFiltrosRecepciones({ familia: ID, moneda: "PEN", q: "F001" });
    expect(leerFiltrosRecepciones(new URLSearchParams(filtrosRecepcionesAQuery(f)))).toEqual(f);
  });

  it("describe lo filtrado en palabras", () => {
    const f = leerFiltrosRecepciones({ desde: "2026-11-01", producto: "6205", moneda: "USD" });
    expect(describirFiltrosRecepciones(f, { familia: null })).toBe(
      "Desde el 01/11/2026 · con el producto «6205» · en dólares",
    );
  });
});
