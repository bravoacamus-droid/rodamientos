import { describe, expect, it } from "vitest";

import { enMonedaDelDocumento, simboloDe } from "./moneda-documento";
import type { ComprobanteDetalle } from "./tipos";

// El caso del centinela de la 116: 3 × 10.87 a 3.448 con retención.
const BASE = {
  moneda: "PEN",
  tipo_cambio: 3.448,
  pen: { gravada: 112.44, descuento: 0, igv: 20.24, total: 132.68, retencion: 3.98 },
  op_gravada: 32.61,
  op_exonerada: 0,
  op_inafecta: 0,
  descuento_global: 0,
  igv: 5.87,
  total: 38.48,
  pagado: 0,
  saldo: 38.48,
  retencion_aplica: true,
  retencion_monto: 1.15,
  cuotas: [{ numero: 1, fecha_vencimiento: "2026-11-13", monto: 38.48, pagado: 0 }],
  lineas: [
    {
      id: "l1",
      producto_id: null,
      codigo: "X1",
      marca: null,
      descripcion: "uno",
      unidad: "NIU",
      cantidad: 3,
      valor_unitario: 10.87,
      descuento_pct: 0,
      importe: 32.61,
    },
  ],
} as unknown as ComprobanteDetalle;

describe("el comprobante en su moneda (116)", () => {
  it("en soles: líneas a céntimos, totales guardados, cuota por el total", () => {
    const d = enMonedaDelDocumento(BASE);
    expect(d.lineas[0]?.valor_unitario).toBe(37.48);
    expect(d.lineas[0]?.importe).toBe(112.44);
    expect(d.op_gravada).toBe(112.44);
    expect(d.igv).toBe(20.24);
    expect(d.total).toBe(132.68);
    expect(d.retencion_monto).toBe(3.98);
    expect(d.cuotas[0]?.monto).toBe(132.68);
    expect(d.saldo).toBe(132.68);
    // Convertir dos veces no convierte dos veces.
    expect(enMonedaDelDocumento(d)).toBe(d);
  });

  it("pagada entera, saldo cero; a medias, al mismo cambio", () => {
    expect(enMonedaDelDocumento({ ...BASE, saldo: 0, pagado: 38.48 }).saldo).toBe(0);
    expect(enMonedaDelDocumento({ ...BASE, saldo: 10, pagado: 28.48 }).saldo).toBe(34.48);
  });

  it("dos cuotas suman exacto el total en soles", () => {
    const d = enMonedaDelDocumento({
      ...BASE,
      cuotas: [
        { numero: 1, fecha_vencimiento: "2026-11-13", monto: 19.24, pagado: 0 },
        { numero: 2, fecha_vencimiento: "2026-12-13", monto: 19.24, pagado: 0 },
      ],
    });
    expect(d.cuotas.reduce((a, q) => a + q.monto, 0)).toBeCloseTo(132.68, 2);
  });

  it("en dólares no toca nada", () => {
    const usd = { ...BASE, moneda: "USD", pen: null, tipo_cambio: null } as ComprobanteDetalle;
    expect(enMonedaDelDocumento(usd)).toBe(usd);
    expect(simboloDe("USD")).toBe("$");
    expect(simboloDe("PEN")).toBe("S/");
  });
});
