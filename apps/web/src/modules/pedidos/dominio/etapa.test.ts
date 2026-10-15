import { describe, expect, it } from "vitest";

import { etapaDe } from "./etapa";

const vacio = { compras: [], guiasEmitidas: 0, facturas: [] };

describe("etapa del pedido", () => {
  it("sin nada colgado está por entregar (se atiende con stock)", () => {
    expect(etapaDe(vacio)).toBe("por_entregar");
  });

  it("con una orden sin registrar, falta registrar la compra", () => {
    expect(etapaDe({ ...vacio, compras: [{ estado: "registrada", falta_factura: true }] })).toBe("por_registrar_compra");
  });

  it("con la compra registrada y sin recibir, espera la mercadería", () => {
    expect(etapaDe({ ...vacio, compras: [{ estado: "registrada", falta_factura: false }] })).toBe("esperando_mercaderia");
  });

  it("recibida la compra, vuelve a estar por entregar", () => {
    expect(etapaDe({ ...vacio, compras: [{ estado: "recibida", falta_factura: false }] })).toBe("por_entregar");
  });

  it("con guía y sin factura, por facturar", () => {
    expect(etapaDe({ ...vacio, guiasEmitidas: 1 })).toBe("por_facturar");
  });

  it("facturado manda sobre lo de antes, y se cierra al cobrar", () => {
    const base = { compras: [{ estado: "registrada", falta_factura: true }], guiasEmitidas: 1 };
    expect(etapaDe({ ...base, facturas: [{ saldo: 100 }] })).toBe("por_cobrar");
    expect(etapaDe({ ...base, facturas: [{ saldo: 0 }] })).toBe("cobrado");
  });
});
