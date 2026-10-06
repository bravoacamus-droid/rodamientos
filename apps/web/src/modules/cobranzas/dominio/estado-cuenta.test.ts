import { describe, expect, it } from "vitest";

import { plazoEnPapel, resumirCuenta } from "./estado-cuenta";

describe("resumirCuenta", () => {
  it("separa lo vencido de lo que todavía está en plazo", () => {
    const r = resumirCuenta([
      { saldo: 100.1, dias_vencido: 12, fecha_vencimiento: "2026-09-24" },
      { saldo: 50.2, dias_vencido: -5, fecha_vencimiento: "2026-10-11" },
      { saldo: 30, dias_vencido: 40, fecha_vencimiento: "2026-08-27" },
    ]);
    expect(r).toEqual({
      documentos: 3,
      total: 180.3,
      vencido: 130.1,
      porVencer: 50.2,
      documentosVencidos: 2,
      mayorAtraso: 40,
    });
  });

  it("sin vencimiento no es atraso", () => {
    const r = resumirCuenta([{ saldo: 80, dias_vencido: 9, fecha_vencimiento: null }]);
    expect(r.vencido).toBe(0);
    expect(r.porVencer).toBe(80);
  });

  it("sin documentos, todo a cero", () => {
    expect(resumirCuenta([]).total).toBe(0);
  });
});

describe("plazoEnPapel", () => {
  it("dice el atraso en días, en singular y plural", () => {
    expect(plazoEnPapel(1, "2026-10-05")).toBe("1 día de atraso");
    expect(plazoEnPapel(15, "2026-09-21")).toBe("15 días de atraso");
  });
  it("y lo que falta para vencer", () => {
    expect(plazoEnPapel(0, "2026-10-06")).toBe("Vence hoy");
    expect(plazoEnPapel(-1, "2026-10-07")).toBe("Vence mañana");
    expect(plazoEnPapel(-8, "2026-10-14")).toBe("Vence en 8 días");
  });
  it("sin vencimiento, al contado", () => {
    expect(plazoEnPapel(0, null)).toBe("Al contado");
  });
});
