import { describe, expect, it } from "vitest";

import { comprobanteParaSunat } from "./para-sunat";
import type { ComprobanteDetalle } from "./tipos";

const empresa = {
  ruc: "20562681206",
  razon_social: "INVERSIONES RODATECH E.I.R.L.",
  nombre_comercial: null,
  direccion: "LIMA",
  ubigeo_codigo: "150132",
  igv_porcentaje: 18,
  departamento: "Lima",
  provincia: "Lima",
  distrito: "San Juan de Lurigancho",
};

const c = {
  tipo: "factura",
  serie: "F001",
  correlativo: 1,
  fecha_emision: "2026-10-23",
  moneda: "USD",
  cliente: "CLIENTE",
  cliente_documento: "20131312955",
  cliente_tipo_documento: "RUC",
  cliente_direccion: null,
  cliente_email: null,
  condicion_pago: "contado",
  dias_credito: 0,
  op_gravada: 35,
  op_exonerada: 0,
  op_inafecta: 0,
  igv: 6.3,
  total: 41.3,
  saldo: 41.3,
  retencion_aplica: false,
  retencion_monto: 0,
  lineas: [{ codigo: "6205-2RSH", descripcion: "6205-2RSH", unidad: "NIU", cantidad: 10, valor_unitario: 3.5, descuento_pct: 0 }],
} as unknown as ComprobanteDetalle;

describe("comprobanteParaSunat", () => {
  it("la tasa del IGV va en PORCENTAJE: con 0.18 SUNAT rechazó todo (3103, beta 23/10)", () => {
    const x = comprobanteParaSunat(c, empresa);
    expect(x.tasaIgv).toBe(18);
    expect(x.items[0]).toMatchObject({ valorVenta: 35, igv: 6.3, precioUnitario: 4.13 });
  });

  it("lleva el departamento, la provincia y el distrito (sin ellos, observaciones 4096-4098)", () => {
    expect(comprobanteParaSunat(c, empresa).emisor).toMatchObject({
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "SAN JUAN DE LURIGANCHO",
    });
  });
});
