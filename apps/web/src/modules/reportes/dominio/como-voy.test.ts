import { describe, expect, it } from "vitest";

import { comoVoy, datosIncompletos } from "./como-voy";

/** Una venta de `monto` cada día entre `desde` y `hasta` (mismo mes). */
function diario(mes: string, desde: number, hasta: number, monto: number) {
  const out = [];
  for (let d = desde; d <= hasta; d++) out.push({ fecha: `${mes}-${String(d).padStart(2, "0")}`, monto });
  return out;
}

describe("comoVoy", () => {
  // Seis meses cerrados de 3,000 (100 al día los de 30 días, a ojo).
  const historia = [
    { fecha: "2026-04-10", monto: 3000 },
    { fecha: "2026-05-10", monto: 3000 },
    { fecha: "2026-06-10", monto: 3000 },
    { fecha: "2026-07-10", monto: 3000 },
    { fecha: "2026-08-10", monto: 3000 },
    ...diario("2026-09", 1, 30, 100),
  ];

  it("compara con la misma fecha del mes pasado, no con el mes entero", () => {
    const c = comoVoy("2026-10-10", [...historia, ...diario("2026-10", 1, 10, 100)]);
    expect(c.vendido).toBe(1000);
    expect(c.mismaFechaMesPasado).toBe(1000);
    expect(c.mesPasado).toBe(3000);
  });

  it("promedia los seis meses cerrados y proyecta el ritmo", () => {
    const c = comoVoy("2026-10-10", [...historia, ...diario("2026-10", 1, 10, 100)]);
    expect(c.promedio).toBe(3000);
    expect(c.mesesPromediados).toBe(6);
    expect(c.proyeccion).toBe(3100); // 100 al día × 31
    expect(c.veredicto).toBe("bien");
  });

  it("dice cuánto falta para la meta del mes", () => {
    const c = comoVoy("2026-10-21", [...historia, ...diario("2026-10", 1, 20, 50)]);
    expect(c.vendido).toBe(1000);
    expect(c.meta).toBe(3000);
    expect(c.metaPuesta).toBe(false);
    expect(c.faltaParaMeta).toBe(2000);
    expect(c.veredicto).toBe("abajo");
  });

  it("la meta puesta en Datos de la empresa manda sobre el promedio", () => {
    const c = comoVoy("2026-10-21", [...historia, ...diario("2026-10", 1, 20, 50)], { meta: 1200 });
    expect(c.meta).toBe(1200);
    expect(c.metaPuesta).toBe(true);
    expect(c.promedio).toBe(3000);
    expect(c.faltaParaMeta).toBe(200);
    expect(c.veredicto).toBe("bien"); // 1,476 a este ritmo
  });

  it("con un rango elegido, compara con sus meses cerrados", () => {
    const c = comoVoy("2026-10-21", historia, { referencia: { desde: "2026-08-01", hasta: "2026-10-21" } });
    expect(c.referenciaDesde).toBe("2026-08-01");
    expect(c.referenciaHasta).toBe("2026-09-01"); // octubre va a medias: no cuenta
    expect(c.mesesPromediados).toBe(2);
  });

  it("un rango sin meses cerrados vuelve a enero → mes anterior", () => {
    const c = comoVoy("2026-10-21", historia, { referencia: { desde: "2026-10-01", hasta: "2026-10-21" } });
    expect(c.referenciaHasta).toBe("2026-09-01");
    expect(c.mesesPromediados).toBe(6); // abril (la primera venta) a septiembre
  });

  it("un poco por debajo es «justo», no «abajo»", () => {
    // 95 al día × 31 = 2,945: el 98 % del promedio.
    const c = comoVoy("2026-10-20", [...historia, ...diario("2026-10", 1, 20, 95)]);
    expect(c.veredicto).toBe("justo");
  });

  it("antes del día 5 juzga por la misma fecha, no por un ritmo de dos días", () => {
    const c = comoVoy("2026-10-02", [...historia, { fecha: "2026-10-01", monto: 5000 }]);
    expect(c.veredicto).toBe("bien"); // 5,000 contra 200 a la misma fecha
  });

  it("los meses antes de la primera venta no cuentan como cero", () => {
    const c = comoVoy("2026-10-10", diario("2026-09", 1, 30, 100));
    expect(c.mesesPromediados).toBe(1);
    expect(c.promedio).toBe(3000);
  });

  it("el 31 se compara con el último día de un mes corto", () => {
    const c = comoVoy("2026-03-31", [...diario("2026-02", 1, 28, 10), ...diario("2026-03", 1, 31, 10)]);
    expect(c.mismaFechaMesPasado).toBe(280);
  });

  it("sin historia no hay veredicto", () => {
    expect(comoVoy("2026-10-10", []).veredicto).toBe("sin_datos");
  });

  it("avisa cuando las facturas dejaron de llegar", () => {
    const c = comoVoy("2026-10-20", [...historia, { fecha: "2026-10-05", monto: 500 }]);
    expect(c.ultimaVenta).toBe("2026-10-05");
    expect(c.diasSinVentas).toBe(15);
    expect(datosIncompletos(c)).toBe(true);
    expect(datosIncompletos(comoVoy("2026-10-10", [...historia, ...diario("2026-10", 1, 10, 100)]))).toBe(false);
  });
});

describe("la meta y el tope", () => {
  it("la meta es el promedio de enero al mes anterior, y el tope el mejor mes", () => {
    const ventas = [
      { fecha: "2025-12-15", monto: 99_999 }, // del año pasado: no cuenta
      { fecha: "2026-01-15", monto: 1000 },
      { fecha: "2026-02-15", monto: 3000 },
      { fecha: "2026-03-15", monto: 2000 },
      { fecha: "2026-04-02", monto: 500 },
    ];
    const c = comoVoy("2026-04-10", ventas);
    expect(c.mesesPromediados).toBe(3);
    expect(c.promedio).toBe(2000);
    expect(c.referenciaDesde).toBe("2026-01-01");
    expect(c.referenciaHasta).toBe("2026-03-01");
    expect(c.mejorMes).toEqual({ mes: "2026-02-01", monto: 3000 });
    expect(c.serie.map((m) => [m.mes, m.monto, m.enCurso])).toEqual([
      ["2026-01-01", 1000, false],
      ["2026-02-01", 3000, false],
      ["2026-03-01", 2000, false],
      ["2026-04-01", 500, true],
    ]);
  });

  it("un mes sin ventas dentro del año cuenta como cero", () => {
    const c = comoVoy("2026-04-10", [
      { fecha: "2026-01-15", monto: 3000 },
      { fecha: "2026-03-15", monto: 3000 },
    ]);
    expect(c.promedio).toBe(2000);
  });

  it("en enero toma los doce meses anteriores", () => {
    const ventas = [];
    for (let m = 1; m <= 12; m++) ventas.push({ fecha: `2025-${String(m).padStart(2, "0")}-10`, monto: m * 100 });
    const c = comoVoy("2026-01-15", ventas);
    expect(c.mesesPromediados).toBe(12);
    expect(c.promedio).toBe(650);
    expect(c.mejorMes?.mes).toBe("2025-12-01");
  });
});
