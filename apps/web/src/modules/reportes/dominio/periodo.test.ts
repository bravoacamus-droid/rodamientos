import { describe, expect, it } from "vitest";

import {
  etiquetaMes,
  finDeMes,
  inicioDeMes,
  mesesAtras,
  etiquetaAging,
  ordenarAging,
  rellenarMeses,
  variacionPct,
} from "./periodo";

describe("etiquetaMes", () => {
  it("da la etiqueta corta del eje", () => {
    expect(etiquetaMes("2026-08-01")).toBe("ago 26");
    expect(etiquetaMes("2026-01-15")).toBe("ene 26");
    expect(etiquetaMes("2025-12-31")).toBe("dic 25");
  });

  it("con basura devuelve lo que le dieron en vez de romper el gráfico", () => {
    expect(etiquetaMes("nada")).toBe("nada");
  });
});

describe("mesesAtras", () => {
  it("retrocede dentro del mismo año", () => {
    expect(mesesAtras("2026-08-15", 3)).toBe("2026-05-01");
  });

  it("cruza el cambio de año", () => {
    expect(mesesAtras("2026-02-10", 3)).toBe("2025-11-01");
    expect(mesesAtras("2026-01-01", 1)).toBe("2025-12-01");
  });

  it("con n negativo avanza", () => {
    expect(mesesAtras("2026-12-01", -1)).toBe("2027-01-01");
  });

  /**
   * El motivo de no hacerlo restando días: 30 días antes del 31 de marzo es el
   * 1 de marzo, no febrero, y la serie saldría con marzo repetido.
   */
  it("un 31 no se queda atrapado en su propio mes", () => {
    expect(mesesAtras("2026-03-31", 1)).toBe("2026-02-01");
  });

  it("doce meses atrás es el mismo mes del año anterior", () => {
    expect(mesesAtras("2026-08-01", 12)).toBe("2025-08-01");
  });
});

describe("inicioDeMes / finDeMes", () => {
  it("inicio es siempre el día 1", () => {
    expect(inicioDeMes("2026-08-25")).toBe("2026-08-01");
  });

  it("fin conoce los meses de 30 y 31", () => {
    expect(finDeMes("2026-08-10")).toBe("2026-08-31");
    expect(finDeMes("2026-04-10")).toBe("2026-04-30");
  });

  it("febrero bisiesto y no bisiesto", () => {
    expect(finDeMes("2028-02-05")).toBe("2028-02-29");
    expect(finDeMes("2026-02-05")).toBe("2026-02-28");
  });
});

describe("rellenarMeses", () => {
  const vacio = (mes: string) => ({ mes, total: 0 });

  it("mete los meses que faltan", () => {
    const filas = [
      { mes: "2026-06-01", total: 100 },
      { mes: "2026-08-01", total: 300 },
    ];
    const serie = rellenarMeses(filas, "2026-06-01", "2026-08-01", vacio);

    // Julio existía aunque no vendiera: un mes en blanco es información.
    expect(serie.map((f) => f.mes)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
    expect(serie[1]!.total).toBe(0);
  });

  it("cruza el cambio de año", () => {
    const serie = rellenarMeses([], "2025-11-01", "2026-02-01", vacio);
    expect(serie.map((f) => f.mes)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("normaliza fechas que no vienen en día 1", () => {
    const filas = [{ mes: "2026-08-25", total: 500 }];
    const serie = rellenarMeses(filas, "2026-08-10", "2026-08-20", vacio);
    expect(serie).toHaveLength(1);
    expect(serie[0]!.total).toBe(500);
  });

  it("un rango invertido devuelve vacío en vez de colgarse", () => {
    expect(rellenarMeses([], "2026-08-01", "2026-01-01", vacio)).toEqual([]);
  });
});

describe("variacionPct", () => {
  it("calcula la subida", () => {
    expect(variacionPct(150, 100)).toBe(50);
  });

  it("calcula la bajada", () => {
    expect(variacionPct(80, 100)).toBe(-20);
  });

  it("sin mes anterior no se inventa un porcentaje", () => {
    // Dividir entre cero daría Infinity y la pantalla enseñaría «∞ %».
    expect(variacionPct(100, 0)).toBeNull();
  });

  it("redondea a un decimal", () => {
    expect(variacionPct(1234, 1000)).toBe(23.4);
  });
});

describe("ordenarAging", () => {
  /**
   * Los códigos son los de `v_cartera`, tal cual salen de la vista. Ordenados
   * alfabéticamente, «1_30» iría antes que «por_vencer» y el gráfico contaría
   * la historia al revés.
   */
  it("ordena por riesgo y no alfabéticamente", () => {
    const desordenado = [
      { tramo: "61_90" },
      { tramo: "por_vencer" },
      { tramo: "mas_90" },
      { tramo: "1_30" },
      { tramo: "31_60" },
      { tramo: "sin_vencimiento" },
    ];
    expect(ordenarAging(desordenado).map((t) => t.tramo)).toEqual([
      "sin_vencimiento",
      "por_vencer",
      "1_30",
      "31_60",
      "61_90",
      "mas_90",
    ]);
  });

  it("un tramo desconocido va al final pero NO se pierde", () => {
    // Si mañana la vista añade un tramo, tiene que seguir sumando en el total
    // aunque todavía no sepamos cómo pintarlo.
    const filas = [{ tramo: "inventado" }, { tramo: "1_30" }];
    const salida = ordenarAging(filas);
    expect(salida).toHaveLength(2);
    expect(salida[1]!.tramo).toBe("inventado");
  });

  it("no muta la lista original", () => {
    const filas = [{ tramo: "61_90" }, { tramo: "1_30" }];
    ordenarAging(filas);
    expect(filas[0]!.tramo).toBe("61_90");
  });
});

describe("etiquetaAging", () => {
  it("traduce el código de la vista a algo legible", () => {
    expect(etiquetaAging("por_vencer")).toBe("Por vencer");
    expect(etiquetaAging("mas_90")).toBe("Más de 90 días");
  });

  it("un código nuevo se enseña tal cual en vez de desaparecer", () => {
    expect(etiquetaAging("inventado")).toBe("inventado");
  });
});
