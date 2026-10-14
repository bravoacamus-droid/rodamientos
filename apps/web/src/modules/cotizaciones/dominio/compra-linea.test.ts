import { describe, expect, it } from "vitest";

import {
  cantidadParaElSiguiente,
  margenSobreCosto,
  precioConMargen,
  proponerOrdenes,
  proponerPendientes,
  proveedoresAPayload,
  resumirCompra,
  type ProveedorLinea,
} from "./compra-linea";

const prov = (id: string, cantidad: number, precio: number | null, extra: Partial<ProveedorLinea> = {}): ProveedorLinea => ({
  proveedorId: id,
  nombre: id.toUpperCase(),
  cantidad,
  precio,
  moneda: "USD",
  incluyeIgv: false,
  tipoCambio: null,
  fecha: null,
  ...extra,
});

describe("la hoja de Willy (09/10)", () => {
  it("dos proveedores: (PC2 × 7 + PC3 × 3) / 10", () => {
    const r = resumirCompra(10, [prov("p2", 7, 10), prov("p3", 3, 12)]);
    expect(r.costo).toBe(10.6);
    expect(r.falta).toBe(0);
    expect(r.sobra).toBe(0);
  });

  it("con 8 de 10, el siguiente proveedor nace con 2", () => {
    expect(cantidadParaElSiguiente(10, [prov("p2", 8, 10)])).toBe(2);
    expect(resumirCompra(10, [prov("p2", 8, 10)]).falta).toBe(2);
  });

  it("se puede comprar de más para stock, y el costo pesa todas", () => {
    const r = resumirCompra(10, [prov("p2", 8, 10), prov("p3", 4, 13)]);
    expect(r.sobra).toBe(2);
    expect(r.costo).toBe(11);
  });

  it("un precio apuntado sin cantidad no pesa en el costo", () => {
    const r = resumirCompra(5, [prov("p1", 5, 10), prov("p2", 0, 2)]);
    expect(r.costo).toBe(10);
  });

  it("en soles con IGV se lleva a dólares sin IGV", () => {
    const r = resumirCompra(3, [prov("p3", 3, 49.56, { moneda: "PEN", tipoCambio: 3.5, incluyeIgv: true })]);
    expect(r.costo).toBe(12);
  });

  it("sin precio o en soles sin tipo de cambio, la fila queda incompleta", () => {
    const r = resumirCompra(5, [prov("a", 5, null), prov("b", 5, 40, { moneda: "PEN" })]);
    expect(r.incompletas).toBe(2);
    expect(r.costo).toBeNull();
    expect(proveedoresAPayload([prov("a", 5, null)])).toEqual([]);
  });
});

describe("el margen", () => {
  it("es sobre el costo y da el precio para cada margen", () => {
    expect(margenSobreCosto(13, 10)).toBeCloseTo(0.3);
    expect(margenSobreCosto(13, null)).toBeNull();
    expect(precioConMargen(10.6, 0.3)).toBe(13.78);
  });
});

describe("las órdenes de compra", () => {
  const linea = (cantidad: number, confirmada: number, proveedores: ProveedorLinea[]) => ({
    productoId: "prod",
    codigo: "6308 2RS",
    cantidad,
    confirmada,
    unidad: "NIU",
    proveedores,
  });

  it("una por proveedor, con lo que se le compra a cada uno", () => {
    const o = proponerOrdenes([
      { ...linea(8, 8, [prov("p1", 8, 5)]), productoId: "a", codigo: "6205" },
      linea(10, 10, [prov("p2", 7, 10), prov("p3", 3, 12), prov("p4", 0, 9)]),
    ]);
    expect(o.map((x) => [x.proveedorId, x.items.map((i) => i.cantidad)])).toEqual([
      ["p1", [8]],
      ["p2", [7]],
      ["p3", [3]],
    ]);
  });

  it("si confirma menos, deja de comprar primero lo más caro", () => {
    const o = proponerOrdenes([linea(10, 8, [prov("p2", 7, 10), prov("p3", 3, 12)])]);
    expect(o.map((x) => [x.proveedorId, x.items[0]?.cantidad])).toEqual([
      ["p2", 7],
      ["p3", 1],
    ]);
  });

  it("lo no confirmado no se compra", () => {
    expect(proponerOrdenes([linea(10, 0, [prov("p2", 10, 10)])])).toEqual([]);
  });

  it("en soles, la orden va en soles y sin IGV", () => {
    const [o] = proponerOrdenes([
      linea(3, 3, [prov("p3", 3, 49.56, { moneda: "PEN", tipoCambio: 3.5, incluyeIgv: true })]),
    ]);
    expect(o?.moneda).toBe("PEN");
    expect(o?.tipoCambio).toBe(3.5);
    expect(o?.items[0]?.costo).toBe(42);
  });
});

describe("otro pedido con la misma cotización (121)", () => {
  const linea = (cantidad: number, confirmada: number, proveedores: ProveedorLinea[]) => ({
    productoId: "prod",
    codigo: "6308 2RS",
    cantidad,
    confirmada,
    unidad: "NIU",
    proveedores,
  });

  it("20 cotizados, 20 ya pedidos y 20 más confirmados: propone los 20 nuevos al mismo proveedor y precio", () => {
    const o = proponerPendientes([linea(20, 40, [prov("p2", 20, 10)])], new Map([["p2:prod", 20]]));
    expect(o).toHaveLength(1);
    expect(o[0]?.items[0]?.cantidad).toBe(20);
    expect(o[0]?.items[0]?.costo).toBe(10);
  });

  it("ya pedido todo: no propone nada", () => {
    expect(proponerPendientes([linea(20, 20, [prov("p2", 20, 10)])], new Map([["p2:prod", 20]]))).toEqual([]);
  });

  it("sin nada pedido, lo de siempre", () => {
    expect(proponerPendientes([linea(10, 8, [prov("p2", 7, 10), prov("p3", 3, 12)])], new Map())).toEqual(
      proponerOrdenes([linea(10, 8, [prov("p2", 7, 10), prov("p3", 3, 12)])]),
    );
  });
});
