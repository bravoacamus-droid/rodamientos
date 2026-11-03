import { describe, expect, it } from "vitest";

import {
  diasDeAtraso,
  diasDesdeVencimiento,
  leerOrden,
  ordenPorDefecto,
  ordenarFacturas,
  ordenarParaCuenta,
  resumirSituacion,
  situacionDe,
  tramoDe,
} from "./situacion";

const HOY = "2026-11-03";

describe("la situación de una factura (03/11)", () => {
  it("pagada si no debe nada, aunque su vencimiento haya pasado", () => {
    expect(situacionDe({ saldo: 0, fecha_vencimiento: "2026-01-01" }, HOY)).toBe("pagada");
  });

  it("vencida desde el día siguiente al vencimiento, no el mismo día (como v_cartera)", () => {
    expect(situacionDe({ saldo: 10, fecha_vencimiento: "2026-11-03" }, HOY)).toBe("por_vencer");
    expect(situacionDe({ saldo: 10, fecha_vencimiento: "2026-11-02" }, HOY)).toBe("vencida");
  });

  it("sin fecha de vencimiento no está vencida", () => {
    expect(situacionDe({ saldo: 10, fecha_vencimiento: null }, HOY)).toBe("sin_vencimiento");
  });

  it("los días y el tramo, con los cortes de v_cartera", () => {
    expect(diasDeAtraso("2026-10-14", HOY)).toBe(20);
    expect(diasDeAtraso("2026-12-01", HOY)).toBe(0);
    expect(tramoDe("2026-10-14", HOY)).toBe("1_30");
    expect(tramoDe("2026-08-10", HOY)).toBe("61_90");
    expect(tramoDe("2026-01-01", HOY)).toBe("mas_90");
    expect(tramoDe(null, HOY)).toBe("sin_vencimiento");
  });
});

describe("el resumen: pagadas, vencidas y por vencer", () => {
  it("lo pagado suma el total; lo que se debe, el saldo", () => {
    const r = resumirSituacion(
      [
        { total: 100, saldo: 0, fecha_vencimiento: "2026-09-01" },
        { total: 200, saldo: 50, fecha_vencimiento: "2026-10-01" },
        { total: 300, saldo: 300, fecha_vencimiento: "2026-12-01" },
      ],
      HOY,
    );
    expect(r.pagada).toEqual({ facturas: 1, monto: 100 });
    expect(r.vencida).toEqual({ facturas: 1, monto: 50 });
    expect(r.por_vencer).toEqual({ facturas: 1, monto: 300 });
    expect(r.todas).toEqual({ facturas: 3, monto: 600 });
  });
});

describe("el orden: por correlativo, como pidió Willy", () => {
  const docs = [
    { numero: "F002-00000568", fecha_vencimiento: "2026-10-15", saldo: 3069.42 },
    { numero: "F002-00000533", fecha_vencimiento: "2026-10-14", saldo: 114.98 },
    { numero: "F002-00000580", fecha_vencimiento: "2026-12-02", saldo: 10 },
    { numero: "F002-00000579", fecha_vencimiento: null, saldo: 5 },
  ];

  it("del más antiguo al último por defecto en lo que se debe", () => {
    expect(ordenPorDefecto(false)).toBe("antiguo");
    expect(ordenarFacturas(docs, "antiguo").map((d) => d.numero)).toEqual([
      "F002-00000533",
      "F002-00000568",
      "F002-00000579",
      "F002-00000580",
    ]);
  });

  it("del último hacia atrás cuando entra lo pagado", () => {
    expect(ordenPorDefecto(true)).toBe("reciente");
    expect(ordenarFacturas(docs, "reciente")[0]?.numero).toBe("F002-00000580");
  });

  it("por vencimiento: lo que vence antes arriba, sin vencimiento al final", () => {
    expect(ordenarFacturas(docs, "vencimiento").map((d) => d.numero)).toEqual([
      "F002-00000533",
      "F002-00000568",
      "F002-00000580",
      "F002-00000579",
    ]);
  });

  it("un orden que no existe no se acepta", () => {
    expect(leerOrden("raro")).toBeNull();
    // El nombre viejo de los enlaces guardados.
    expect(leerOrden("atraso")).toBe("vencimiento");
  });
});

describe("el orden del estado de cuenta (03/11)", () => {
  it("primero lo que se debe por vencimiento, luego lo pagado por número", () => {
    const r = ordenarParaCuenta([
      { numero: "F002-00000300", fecha_vencimiento: "2026-01-10", saldo: 0 },
      { numero: "F002-00000570", fecha_vencimiento: "2026-12-01", saldo: 50 },
      { numero: "F002-00000200", fecha_vencimiento: "2025-11-10", saldo: 0 },
      { numero: "F002-00000568", fecha_vencimiento: "2026-10-15", saldo: 30 },
    ]);
    expect(r.map((d) => d.numero)).toEqual(["F002-00000568", "F002-00000570", "F002-00000200", "F002-00000300"]);
  });
});

describe("los días con signo para el papel (03/11)", () => {
  it("negativo lo que falta, positivo lo vencido", () => {
    expect(diasDesdeVencimiento("2026-11-08", HOY)).toBe(-5);
    expect(diasDesdeVencimiento("2026-11-03", HOY)).toBe(0);
    expect(diasDesdeVencimiento("2026-10-15", HOY)).toBe(19);
    expect(diasDesdeVencimiento(null, HOY)).toBe(0);
  });
});
