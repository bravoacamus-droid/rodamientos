import { describe, expect, it } from "vitest";

import { despachoAMedias, etapaDe, textoEtapa } from "./etapa";

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

  // 161: con UNA guía pasaba a «por facturar» aunque saliera una parte.
  describe("despacho a medias", () => {
    const parcial = { confirmado: 10, despachado: 6, facturado: 0 };
    const entero = { confirmado: 10, despachado: 10, facturado: 0 };

    it("con una guía que no lleva todo, salió una parte", () => {
      expect(etapaDe({ ...vacio, guiasEmitidas: 1, despacho: parcial })).toBe("despacho_parcial");
    });

    it("con todo despachado, por facturar como antes", () => {
      expect(etapaDe({ ...vacio, guiasEmitidas: 1, despacho: entero })).toBe("por_facturar");
    });

    it("lo que falta entregar manda sobre lo facturado y lo cobrado", () => {
      expect(etapaDe({ ...vacio, guiasEmitidas: 1, despacho: parcial, facturas: [{ saldo: 0 }] })).toBe(
        "despacho_parcial",
      );
    });

    it("sin nada despachado no es a medias", () => {
      expect(despachoAMedias({ confirmado: 10, despachado: 0, facturado: 0 })).toBe(false);
      expect(etapaDe({ ...vacio, despacho: { confirmado: 10, despachado: 0, facturado: 0 } })).toBe("por_entregar");
    });

    it("sin la cuenta (no se pudo leer), se decide como antes", () => {
      expect(etapaDe({ ...vacio, guiasEmitidas: 1, despacho: null })).toBe("por_facturar");
    });

    it("dice cuánto falta, sin ceros de relleno", () => {
      expect(textoEtapa("despacho_parcial", parcial)).toBe("Salió una parte: faltan 4 de 10");
      expect(textoEtapa("despacho_parcial", { confirmado: 3, despachado: 0.5, facturado: 0 })).toBe(
        "Salió una parte: faltan 2.5 de 3",
      );
      expect(textoEtapa("despacho_parcial")).toBe("Salió una parte");
      expect(textoEtapa("por_facturar", parcial)).toBe("Entregado · por facturar");
    });
  });
});
