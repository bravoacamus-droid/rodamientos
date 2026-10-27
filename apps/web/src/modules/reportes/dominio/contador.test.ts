import { describe, expect, it } from "vitest";

import {
  filaCompra,
  filaRegistro,
  nombreMes,
  rangoDeMes,
  separarCompras,
  sinSeriesDePrueba,
  tipoDocumentoSunat,
  totalesRegistro,
  type ComprobanteContable,
} from "./contador";

function comp(c: Partial<ComprobanteContable> = {}): ComprobanteContable {
  return {
    tipo: "factura",
    numero: "F002-00000559",
    fecha: "2026-10-04",
    vence: null,
    estado: "emitido",
    moneda: "USD",
    tipoCambio: 3.442,
    gravada: 59.44,
    igv: 10.7,
    total: 70.14,
    retencion: 0,
    penGravada: null,
    penIgv: null,
    penTotal: null,
    penRetencion: null,
    cliente: "CLIENTE SAC",
    clienteTipoDoc: "RUC",
    clienteDoc: "20123456789",
    referencia: null,
    ...c,
  };
}

describe("filaRegistro", () => {
  it("una factura en dólares pasa a soles con su cambio, y la fila cuadra sola", () => {
    const f = filaRegistro(comp());
    expect(f).toMatchObject({ tipo: "01", serie: "F002", numero: "00000559", clienteTipoDoc: "6" });
    expect(f.base).toBe(204.59); // 59.44 × 3.442 = 204.592
    expect(f.igv).toBe(36.83); // 10.70 × 3.442 = 36.829
    expect(f.total).toBe(241.42); // base + IGV en soles, no el total convertido aparte
    expect(f.totalOriginal).toBe(70.14);
    expect(f.falta).toBeNull();
  });

  it("en soles usa lo impreso y no convierte", () => {
    const f = filaRegistro(
      comp({ moneda: "PEN", tipoCambio: 3.5, penGravada: 208.04, penIgv: 37.45, penTotal: 245.49 }),
    );
    expect(f).toMatchObject({ base: 208.04, igv: 37.45, total: 245.49, totalOriginal: 245.49 });
  });

  it("la nota de crédito resta y lleva su referencia", () => {
    const f = filaRegistro(
      comp({
        tipo: "nota_credito",
        numero: "FC02-00000003",
        referencia: { tipo: "factura", numero: "F002-00000500", fecha: "2026-09-01" },
      }),
    );
    expect(f.tipo).toBe("07");
    expect(f.base).toBe(-204.59);
    expect(f.total).toBe(-241.42);
    expect(f).toMatchObject({ refTipo: "01", refSerie: "F002", refNumero: "00000500", refFecha: "2026-09-01" });
  });

  it("el anulado se queda en el registro con importes en cero", () => {
    const f = filaRegistro(comp({ estado: "anulado" }));
    expect(f).toMatchObject({ anulado: true, base: 0, igv: 0, total: 0, totalOriginal: 0, falta: null });
  });

  it("sin cambio no inventa: deja en blanco y lo dice", () => {
    const f = filaRegistro(comp({ tipoCambio: null }));
    expect(f).toMatchObject({ base: null, igv: null, total: null, falta: "Sin tipo de cambio" });
  });

  it("la retención también va en soles", () => {
    expect(filaRegistro(comp({ retencion: 21, total: 700 })).retencion).toBe(72.28);
  });
});

describe("totalesRegistro", () => {
  it("suma lo convertido y cuenta lo que falta", () => {
    const filas = [
      filaRegistro(comp()),
      filaRegistro(comp({ tipo: "nota_credito", numero: "FC02-1" })),
      filaRegistro(comp({ estado: "anulado" })),
      filaRegistro(comp({ tipoCambio: null })),
    ];
    expect(totalesRegistro(filas)).toEqual({
      base: 0,
      igv: 0,
      total: 0,
      retencion: 0,
      documentos: 4,
      anulados: 1,
      sinCambio: 1,
    });
  });
});

describe("mes", () => {
  it("rango y nombre", () => {
    expect(rangoDeMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDeMes("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(rangoDeMes("2026-13")).toBeNull();
    expect(rangoDeMes("x")).toBeNull();
    expect(nombreMes("2026-10")).toBe("octubre 2026");
  });

  it("tipo de documento de identidad", () => {
    expect(tipoDocumentoSunat("RUC")).toBe("6");
    expect(tipoDocumentoSunat("dni")).toBe("1");
    expect(tipoDocumentoSunat(null)).toBe("0");
  });
});

describe("filaCompra", () => {
  const compra = {
    fecha: "2026-10-04",
    numero: "CMP-26-00014",
    documento: "F001-123",
    tipo: "local",
    moneda: "USD" as const,
    tipoCambio: 3.442,
    base: 100,
    igv: 18,
    total: 118,
    proveedor: "PROVEEDOR SAC",
    proveedorTipoDoc: "RUC",
    proveedorDoc: "20111111111",
  };

  it("en dólares, por el cambio del día", () => {
    expect(filaCompra(compra)).toMatchObject({ serie: "F001", correlativo: "123", base: 344.2, igv: 61.96, total: 406.16, falta: null });
  });

  it("en soles, tal cual", () => {
    expect(filaCompra({ ...compra, moneda: "PEN", tipoCambio: 3.75 })).toMatchObject({ base: 100, igv: 18, total: 118, tipoCambio: null });
  });

  it("sin factura del proveedor o sin cambio, lo dice", () => {
    expect(filaCompra({ ...compra, documento: null }).falta).toBe("Sin factura del proveedor");
    expect(filaCompra({ ...compra, tipoCambio: null, documento: null }).falta).toBe(
      "Sin tipo de cambio; sin factura del proveedor",
    );
  });
});

describe("lo que no va al registro (157)", () => {
  it("las series de prueba se quitan y se cuentan", () => {
    const docs = [
      { serie: "F002", numero: "F002-00000560" },
      { serie: "F001", numero: "F001-00000001" },
      { serie: "FC01", numero: "FC01-00000001" },
    ];
    const r = sinSeriesDePrueba(docs, new Set(["F001", "FC01", "T001"]));
    expect(r.quedan.map((d) => d.numero)).toEqual(["F002-00000560"]);
    expect(r.omitidos).toBe(2);
  });

  it("sin series de prueba no quita nada", () => {
    expect(sinSeriesDePrueba([{ serie: "F002" }], new Set()).omitidos).toBe(0);
  });

  it("una orden sin factura del proveedor va aparte, con su total", () => {
    const base = {
      fecha: "2026-10-04",
      tipo: "local",
      moneda: "USD" as const,
      tipoCambio: 3.442,
      base: 100,
      igv: 18,
      total: 118,
      proveedorTipoDoc: "RUC",
      proveedorDoc: "20111111111",
    };
    const r = separarCompras([
      { ...base, numero: "CMP-26-00015", documento: "452528", proveedor: "CON FACTURA SAC" },
      { ...base, numero: "CMP-26-00010", documento: null, proveedor: "SIN FACTURA SAC", total: 344.944 },
      { ...base, numero: "CMP-26-00011", documento: "  ", proveedor: "EN BLANCO SAC" },
    ]);
    expect(r.registro.map((c) => c.numero)).toEqual(["CMP-26-00015"]);
    expect(r.sinFactura).toEqual([
      { fecha: "2026-10-04", numero: "CMP-26-00010", proveedor: "SIN FACTURA SAC", moneda: "USD", total: 344.94 },
      { fecha: "2026-10-04", numero: "CMP-26-00011", proveedor: "EN BLANCO SAC", moneda: "USD", total: 118 },
    ]);
  });
});
