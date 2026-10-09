import { describe, expect, it } from "vitest";

import { faltaComprar, faltanParaOtros, otrosPedidos, type DemandaProducto } from "./demanda";

const pedido = (id: string, cantidad: number, estado: "aprobada" | "borrador" | "enviada" = "aprobada") => ({
  cotizacionId: id,
  numero: id.toUpperCase(),
  cliente: "C",
  fecha: "2026-10-09",
  cantidad,
  estado,
});

// La prueba del 09/10: REACTIVOS pide 10, COFACO tenía 6 aprobados.
const d: DemandaProducto = {
  productoId: "6308",
  aprobadas: [pedido("reactivos", 10), pedido("cofaco", 6)],
  sinConfirmar: [pedido("borrador", 4, "borrador")],
  stock: 0,
  enCamino: 0,
};

describe("cuántos piden lo mismo", () => {
  it("se compra para todos los aprobados, no solo para este", () => {
    expect(faltaComprar(d)).toBe(16);
    expect(faltanParaOtros(d, 10)).toBe(6);
  });

  it("el borrador se enseña pero no suma", () => {
    const o = otrosPedidos(d, "reactivos");
    expect(o.total).toBe(2);
    expect(o.cantidadAprobada).toBe(6);
  });

  it("el stock y lo que ya viene descuentan", () => {
    expect(faltaComprar({ ...d, stock: 4, enCamino: 3 })).toBe(9);
    expect(faltanParaOtros({ ...d, stock: 4, enCamino: 3 }, 10)).toBe(0);
  });

  it("sin datos, nada", () => {
    expect(faltaComprar(undefined)).toBe(0);
    expect(otrosPedidos(undefined, null).total).toBe(0);
  });
});
