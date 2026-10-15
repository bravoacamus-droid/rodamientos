import { describe, expect, it } from "vitest";

import { papelDelPedido, type PedidoParaHoja } from "./hoja";

const base: PedidoParaHoja = {
  numero: "PED-26-00005",
  fecha: "2026-10-15",
  cliente: "ACEROS CHILCA S.A.C.",
  cotizacion: { numero: "COT1-000014", ordenCompraCliente: "OC-77" },
  lineas: [
    { codigo: "NUTR20", marca: "INA", descripcion: "Rodillo", cantidad: 2, unidad: "NIU", valorUnitario: 10, descuentoPct: 0 },
    { codigo: "729865B", marca: null, descripcion: "Rodamiento", cantidad: 1, unidad: "NIU", valorUnitario: 5.5, descuentoPct: 0 },
  ],
  papel: { moneda: "USD", tipoCambio: null, clienteDocumento: "RUC 20100000001", clienteDireccion: null },
};

describe("papelDelPedido", () => {
  it("suma en dólares con IGV y sin columna de descuento si no hay", () => {
    const h = papelDelPedido(base);
    expect(h.columnas.map((c) => c.clave)).not.toContain("descuento");
    expect(h.filas.map((f) => f.importe)).toEqual(["20.00", "5.50"]);
    expect(h.totales.map((t) => t.valor)).toEqual(["$ 25.50", "$ 4.59", "$ 30.09"]);
    expect(h.filas[1]?.marca).toBe("—");
    expect(h.datos.filter(Boolean).map((d) => d!.etiqueta)).not.toContain("Dirección");
  });

  it("en soles redondea el unitario antes del importe, como la ficha", () => {
    const h = papelDelPedido({ ...base, papel: { ...base.papel, moneda: "PEN", tipoCambio: 3.333 } });
    // 10 × 3.333 = 33.33 → ×2 = 66.66; 5.5 × 3.333 = 18.33
    expect(h.filas.map((f) => f.importe)).toEqual(["66.66", "18.33"]);
    expect(h.totales[0]?.valor).toBe("S/ 84.99");
    expect(h.nota).toContain("3.333");
  });

  it("enseña el descuento cuando alguna línea lo lleva", () => {
    const h = papelDelPedido({
      ...base,
      lineas: [{ ...base.lineas[0]!, descuentoPct: 10 }, base.lineas[1]!],
    });
    expect(h.columnas.map((c) => c.clave)).toContain("descuento");
    expect(h.filas.map((f) => f.descuento)).toEqual(["10%", "—"]);
    expect(h.filas[0]?.importe).toBe("18.00");
  });
});
