import { describe, expect, it } from "vitest";

import {
  avisosPago,
  bloqueosPago,
  etiquetaAtraso,
  prioridad,
  quedaSaldado,
  repartoEnCuotas,
  tonoTramo,
} from "./cobro";
import type { CuotaComprobante, DocumentoPorCobrar } from "./tipos";

const HOY = "2026-08-25";

const DOC: DocumentoPorCobrar = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: "F001-00000001",
  tipo: "factura",
  cliente_id: "22222222-2222-2222-2222-222222222222",
  cliente: "MINERA LOS ANDES S.A.C.",
  documento: "20100047218",
  fecha_emision: "2026-08-25",
  fecha_vencimiento: "2026-09-24",
  condicion_pago: "credito",
  total: 528.99,
  pagado: 0,
  saldo: 528.99,
  estado: "emitido",
  orden_compra_cliente: null,
  dias_vencido: 0,
  tramo_aging: "por_vencer",
  vendedor: "Willy Rodríguez",
  detraccion_aplica: false,
  detraccion_monto: 0,
  retencion_aplica: false,
  retencion_monto: 0,
};

describe("bloqueosPago", () => {
  it("un pago normal no bloquea", () => {
    expect(bloqueosPago(DOC, 528.99, HOY)).toEqual([]);
  });

  it("sin documento no se puede cobrar", () => {
    const lista = bloqueosPago(null, 100, HOY);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.campo).toBe("documento");
  });

  it("no se cobra sobre un documento anulado", () => {
    const anulado = { ...DOC, estado: "anulado" };
    expect(bloqueosPago(anulado, 100, HOY).some((b) => b.campo === "documento")).toBe(true);
  });

  it("el importe tiene que ser mayor que cero", () => {
    expect(bloqueosPago(DOC, 0, HOY).some((b) => b.campo === "monto")).toBe(true);
    expect(bloqueosPago(DOC, -5, HOY).some((b) => b.campo === "monto")).toBe(true);
    expect(bloqueosPago(DOC, Number.NaN, HOY).some((b) => b.campo === "monto")).toBe(true);
  });

  it("no se cobra más que el saldo", () => {
    const lista = bloqueosPago(DOC, 600, HOY);
    expect(lista[0]!.mensaje).toContain("sobre un saldo de 528.99");
  });

  /**
   * La misma holgura que `comp_pagado_rango` en la base. Existe porque el
   * cliente transfiere el total redondeado y a veces sobra un céntimo por el
   * cambio; sin ella, ese pago se rechazaría.
   */
  it("tolera el céntimo de más", () => {
    expect(bloqueosPago(DOC, 529.0, HOY)).toEqual([]);
    expect(bloqueosPago(DOC, 529.5, HOY).some((b) => b.campo === "monto")).toBe(true);
  });

  it("una fecha inválida bloquea", () => {
    expect(bloqueosPago(DOC, 100, "ayer").some((b) => b.campo === "fecha")).toBe(true);
  });
});

describe("avisosPago", () => {
  it("un pago normal y completo no genera ruido", () => {
    expect(avisosPago(DOC, 528.99, "transferencia", HOY, HOY)).toEqual([]);
  });

  it("avisa de un pago parcial y de cuánto queda", () => {
    const lista = avisosPago(DOC, 200, "transferencia", HOY, HOY);
    expect(lista.some((a) => a.mensaje.includes("328.99"))).toBe(true);
  });

  it("avisa de una fecha futura", () => {
    const lista = avisosPago(DOC, 100, "transferencia", "2026-12-01", HOY);
    expect(lista.some((a) => a.clave === "futuro")).toBe(true);
  });

  /**
   * La detracción y la retención reducen el saldo pero no entran a la cuenta.
   * Quien concilia el banco no las va a encontrar en el extracto, y esa
   * diferencia es la que hace perder una tarde.
   */
  it("avisa de los medios que no son dinero en la cuenta", () => {
    for (const medio of ["detraccion", "retencion", "nota_credito"] as const) {
      const lista = avisosPago(DOC, 100, medio, HOY, HOY);
      expect(lista.some((a) => a.clave === "sin-caja")).toBe(true);
    }
  });

  it("sospecha si el importe coincide con la detracción", () => {
    const conSpot = { ...DOC, detraccion_aplica: true, detraccion_monto: 63.48 };
    const lista = avisosPago(conSpot, 63.48, "transferencia", HOY, HOY);
    expect(lista.some((a) => a.clave === "parece-detraccion")).toBe(true);
  });

  it("no sospecha si el medio ya es detracción", () => {
    const conSpot = { ...DOC, detraccion_aplica: true, detraccion_monto: 63.48 };
    const lista = avisosPago(conSpot, 63.48, "detraccion", HOY, HOY);
    expect(lista.some((a) => a.clave === "parece-detraccion")).toBe(false);
  });

  it("sin documento no dice nada", () => {
    expect(avisosPago(null, 100, "efectivo", HOY, HOY)).toEqual([]);
  });
});

describe("quedaSaldado", () => {
  it("el pago exacto salda", () => {
    expect(quedaSaldado(528.99, 528.99)).toBe(true);
  });

  it("un céntimo de menos también salda", () => {
    // Sin la tolerancia, el documento se quedaría en «parcial» para siempre.
    expect(quedaSaldado(528.99, 528.98)).toBe(true);
  });

  it("dos céntimos de menos NO saldan", () => {
    expect(quedaSaldado(528.99, 528.97)).toBe(false);
  });

  it("un pago parcial no salda", () => {
    expect(quedaSaldado(528.99, 100)).toBe(false);
  });
});

describe("repartoEnCuotas", () => {
  const cuotas: CuotaComprobante[] = [
    { id: "c1", numero: 1, fecha_vencimiento: "2026-09-24", monto: 200, pagado: 0, saldo: 200 },
    { id: "c2", numero: 2, fecha_vencimiento: "2026-10-24", monto: 200, pagado: 0, saldo: 200 },
    { id: "c3", numero: 3, fecha_vencimiento: "2026-11-24", monto: 128.99, pagado: 0, saldo: 128.99 },
  ];

  it("llena de la más antigua a la más nueva", () => {
    const reparto = repartoEnCuotas(cuotas, 300);
    expect(reparto.map((r) => r.aplica)).toEqual([200, 100, 0]);
    expect(reparto.map((r) => r.quedaSaldo)).toEqual([0, 100, 128.99]);
  });

  it("un pago que cubre todo deja las tres en cero", () => {
    const reparto = repartoEnCuotas(cuotas, 528.99);
    expect(reparto.every((r) => r.quedaSaldo === 0)).toBe(true);
  });

  it("respeta el orden aunque lleguen desordenadas", () => {
    const desordenadas = [cuotas[2]!, cuotas[0]!, cuotas[1]!];
    const reparto = repartoEnCuotas(desordenadas, 250);
    expect(reparto.map((r) => r.cuota.numero)).toEqual([1, 2, 3]);
    expect(reparto[0]!.aplica).toBe(200);
    expect(reparto[1]!.aplica).toBe(50);
  });

  it("no reparte más de lo que hay", () => {
    const reparto = repartoEnCuotas(cuotas, 1000);
    const total = reparto.reduce((a, r) => a + r.aplica, 0);
    expect(total).toBe(528.99);
  });

  it("una cuota ya pagada no vuelve a recibir", () => {
    const conPagada = [
      { ...cuotas[0]!, pagado: 200, saldo: 0 },
      cuotas[1]!,
    ];
    const reparto = repartoEnCuotas(conPagada, 150);
    expect(reparto[0]!.aplica).toBe(0);
    expect(reparto[1]!.aplica).toBe(150);
  });

  it("sin cuotas devuelve lista vacía", () => {
    expect(repartoEnCuotas([], 100)).toEqual([]);
  });
});

describe("etiquetaAtraso", () => {
  it("dice los días, no solo el tramo", () => {
    // «vencido hace 47 días» mueve más que «31-60», que es una categoría.
    expect(etiquetaAtraso(47, "2026-07-09")).toBe("vencido hace 47 días");
  });

  it("un día se dice en singular", () => {
    expect(etiquetaAtraso(1, "2026-08-24")).toBe("vencido ayer");
  });

  it("sin vencer lo dice", () => {
    expect(etiquetaAtraso(0, "2026-09-24")).toBe("por vencer");
  });

  it("sin fecha de vencimiento no inventa un atraso", () => {
    expect(etiquetaAtraso(0, null)).toBe("sin vencimiento");
  });
});

describe("prioridad", () => {
  it("lo más viejo pesa más que lo más grande", () => {
    // 200 con 120 días atrasados frente a 5.000 con 10: llamar en el orden
    // equivocado cuesta dinero.
    const vieja = prioridad(200, 120, 5000);
    const grande = prioridad(5000, 10, 5000);
    expect(vieja).toBeGreaterThan(grande);
  });

  it("a igual atraso, manda el importe", () => {
    expect(prioridad(5000, 30, 5000)).toBeGreaterThan(prioridad(500, 30, 5000));
  });

  it("el atraso satura a los 90 días", () => {
    expect(prioridad(1000, 90, 1000)).toBe(prioridad(1000, 300, 1000));
  });

  it("lo que no ha vencido y es pequeño sale bajo", () => {
    expect(prioridad(100, 0, 5000)).toBeLessThan(10);
  });

  it("una cartera vacía no divide entre cero", () => {
    expect(prioridad(0, 0, 0)).toBe(0);
  });
});

describe("tonoTramo", () => {
  it("del verde al rojo según el riesgo", () => {
    expect(tonoTramo("por_vencer")).toBe("success");
    expect(tonoTramo("1_30")).toBe("warning");
    expect(tonoTramo("61_90")).toBe("danger");
    expect(tonoTramo("mas_90")).toBe("danger");
    expect(tonoTramo("sin_vencimiento")).toBe("neutral");
  });
});
