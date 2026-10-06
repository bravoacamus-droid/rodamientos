import { describe, expect, it } from "vitest";

import {
  concentracion,
  emparejar,
  periodosDelRango,
  rangoComparado,
  restarUnAnio,
  resumirSegmentos,
  segmentoDe,
  tasaDeCierre,
  type FilaCliente,
} from "./ejecutivo";

function fila(p: Partial<FilaCliente>): FilaCliente {
  return {
    id: "x",
    cliente: "X",
    documento: null,
    venta: 0,
    documentos: 0,
    ventaPrev: 0,
    documentosPrev: 0,
    primera: "2024-01-10",
    ultima: "2026-08-01",
    documentosHist: 5,
    diasSinComprar: 10,
    ...p,
  };
}

describe("rangoComparado", () => {
  it("el año pasado es el mismo tramo, un año antes", () => {
    expect(rangoComparado({ desde: "2026-08-01", hasta: "2026-08-31" }, "anio")).toEqual({
      desde: "2025-08-01",
      hasta: "2025-08-31",
    });
  });

  it("el periodo anterior tiene la misma longitud", () => {
    expect(rangoComparado({ desde: "2026-08-01", hasta: "2026-08-31" }, "anterior")).toEqual({
      desde: "2026-07-01",
      hasta: "2026-07-31",
    });
  });

  it("desde un día 1, el anterior son los mismos meses de antes", () => {
    expect(rangoComparado({ desde: "2025-11-01", hasta: "2026-10-06" }, "anterior")).toEqual({
      desde: "2024-11-01",
      hasta: "2025-10-06",
    });
    expect(rangoComparado({ desde: "2026-10-01", hasta: "2026-10-06" }, "anterior")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-06",
    });
  });

  it("el 31 de marzo, un mes antes, es el último de febrero", () => {
    expect(rangoComparado({ desde: "2026-03-01", hasta: "2026-03-31" }, "anterior")).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
  });

  it("un rango a mano que no empieza en 1, por longitud", () => {
    expect(rangoComparado({ desde: "2026-03-10", hasta: "2026-03-19" }, "anterior")).toEqual({
      desde: "2026-02-28",
      hasta: "2026-03-09",
    });
  });

  it("el 29 de febrero cae en el 28, no en marzo", () => {
    expect(restarUnAnio("2028-02-29")).toBe("2027-02-28");
  });
});

describe("periodosDelRango", () => {
  it("cuenta todos los meses del rango aunque no tengan datos", () => {
    expect(periodosDelRango("2025-11-15", "2026-02-03", "mes")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("emparejar", () => {
  it("pone cada periodo junto al de la misma posición en la comparación", () => {
    const r = emparejar(
      [{ periodo: "2026-02-01", v: 5 }],
      [{ periodo: "2025-01-01", v: 3 }],
      ["2026-01-01", "2026-02-01"],
      ["2025-01-01", "2025-02-01"],
      (p) => p.v,
    );
    expect(r).toEqual([
      { periodo: "2026-01-01", periodoPrevio: "2025-01-01", actual: 0, previo: 3 },
      { periodo: "2026-02-01", periodoPrevio: "2025-02-01", actual: 5, previo: 0 },
    ]);
  });

  it("sin pareja, la comparación es null y no un cero", () => {
    const r = emparejar([], [], ["a", "b"], ["c"], () => 0);
    expect(r[1]?.previo).toBeNull();
  });
});

describe("segmentoDe", () => {
  const d = "2026-01-01";
  const h = "2026-06-30";

  it("nuevo manda sobre todo lo demás", () => {
    expect(segmentoDe(fila({ primera: "2026-03-02", venta: 100 }), d, h)).toBe("nuevo");
  });
  it("dejó de comprar", () => {
    expect(segmentoDe(fila({ venta: 0, ventaPrev: 500 }), d, h)).toBe("perdido");
  });
  it("vuelve tras un periodo sin comprar: compra más", () => {
    expect(segmentoDe(fila({ venta: 80, ventaPrev: 0 }), d, h)).toBe("crece");
  });
  it("un 5 % arriba es lo mismo que antes", () => {
    expect(segmentoDe(fila({ venta: 105, ventaPrev: 100 }), d, h)).toBe("estable");
  });
  it("un 30 % abajo, compra menos", () => {
    expect(segmentoDe(fila({ venta: 70, ventaPrev: 100 }), d, h)).toBe("baja");
  });

  it("resumirSegmentos suma clientes y venta por grupo, siempre los cinco", () => {
    const r = resumirSegmentos(
      [fila({ venta: 70, ventaPrev: 100 }), fila({ venta: 0, ventaPrev: 40 })],
      d,
      h,
    );
    expect(r).toHaveLength(5);
    expect(r.find((s) => s.segmento === "baja")).toMatchObject({ clientes: 1, venta: 70 });
    expect(r.find((s) => s.segmento === "perdido")).toMatchObject({ clientes: 1, ventaPrev: 40 });
  });
});

describe("concentracion", () => {
  it("cuánto se llevan los primeros", () => {
    const filas = [fila({ venta: 80 }), fila({ venta: 15 }), fila({ venta: 5 })];
    expect(concentracion(filas, 1)).toBe(80);
  });
  it("sin venta no hay porcentaje", () => {
    expect(concentracion([fila({ venta: 0 })], 5)).toBeNull();
  });
});

describe("tasaDeCierre", () => {
  it("solo cuenta las decididas", () => {
    expect(tasaDeCierre({ aprobada: 3, rechazada: 1, vencida: 0 })).toBe(75);
  });
  it("sin ninguna decidida, null", () => {
    expect(tasaDeCierre({ aprobada: 0, rechazada: 0, vencida: 0 })).toBeNull();
  });
});
