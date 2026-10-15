import { describe, expect, it } from "vitest";

import { cifras, cobroDe, filtrar, leerOrden, margenPct, ordenar, paginar, sunatDe, totalVisible, type FilaPedido } from "./lista";

const fila = (o: Partial<FilaPedido>): FilaPedido => ({
  id: "1",
  numero: "PED-26-00001",
  secuencia: 1,
  fecha: "2026-10-14",
  cotizacionId: "c",
  cotizacion: "COT1-000012",
  clienteId: "cl",
  cliente: "Reactivos Nacionales",
  moneda: "USD",
  tipoCambio: null,
  venta: 100,
  costo: 80,
  compras: { total: 0, porRegistrar: 0 },
  guia: null,
  facturas: [],
  etapa: "por_entregar",
  productos: [{ codigo: "6202-2Z", cantidad: 1 }],
  vigente: true,
  ...o,
});

const factura = (o: Partial<FilaPedido["facturas"][number]> = {}) => ({
  id: "f",
  numero: "F002-1",
  saldoUsd: 0,
  saldo: 0,
  moneda: "USD" as const,
  vencida: false,
  sunat: "aceptado" as const,
  ...o,
});

describe("tabla de pedidos", () => {
  it("el margen va sobre el costo, y sin costo no hay margen", () => {
    expect(margenPct(100, 80)).toBe(25);
    expect(margenPct(100, 0)).toBeNull();
  });

  it("el total visible lleva IGV y va en soles si la venta es en soles", () => {
    expect(totalVisible({ venta: 100, moneda: "USD", tipoCambio: null })).toBe(118);
    expect(totalVisible({ venta: 100, moneda: "PEN", tipoCambio: 3.5 })).toBe(413);
  });

  it("cobro y SUNAT dicen lo peor de sus facturas", () => {
    expect(cobroDe(fila({}))).toBe("sin_factura");
    expect(cobroDe(fila({ facturas: [factura({ saldoUsd: 10 }), factura({ saldoUsd: 5, vencida: true })] }))).toBe("vencido");
    expect(cobroDe(fila({ facturas: [factura()] }))).toBe("pagado");
    expect(sunatDe(fila({ facturas: [factura(), factura({ sunat: "rechazado" })] }))).toBe("rechazado");
  });

  it("busca por pedido, cotización, cliente o código, sin tildes ni mayúsculas", () => {
    const filas = [fila({}), fila({ id: "2", numero: "PED-26-00002", cliente: "Fundición Ventanilla", productos: [] })];
    expect(filtrar(filas, { q: "fundicion" }).map((f) => f.id)).toEqual(["2"]);
    expect(filtrar(filas, { q: "6202" }).map((f) => f.id)).toEqual(["1"]);
    expect(filtrar(filas, { guia: "sin" })).toHaveLength(2);
  });

  it("ordena por margen y lee el orden de la URL", () => {
    const filas = [fila({ id: "a", costo: 90 }), fila({ id: "b", costo: 50 }), fila({ id: "c", costo: 0 })];
    expect(ordenar(filas, "margen", true).map((f) => f.id)).toEqual(["b", "a", "c"]);
    expect(leerOrden("-total")).toEqual({ campo: "total", desc: true });
    expect(leerOrden("cliente")).toEqual({ campo: "cliente", desc: false });
    expect(leerOrden("lo-que-sea")).toEqual({ campo: "fecha", desc: true });
  });

  it("las cifras son de todo lo filtrado y el margen solo con costo", () => {
    const c = cifras([
      fila({ venta: 100, costo: 80, facturas: [factura({ saldoUsd: 50 })] }),
      fila({ venta: 50, costo: 0, etapa: "por_facturar" }),
    ]);
    expect(c).toMatchObject({ pedidos: 2, venta: 150, margen: 25, porFacturar: 1, porCobrarUsd: 50 });
  });

  it("pagina sin salirse", () => {
    const p = paginar([1, 2, 3, 4, 5], 9, 2);
    expect(p).toMatchObject({ filas: [5], actual: 3, paginas: 3, anterior: "2", siguiente: null });
  });
});
