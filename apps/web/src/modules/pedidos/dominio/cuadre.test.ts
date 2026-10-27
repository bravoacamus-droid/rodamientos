import { describe, expect, it } from "vitest";

import { cuadreDelPedido } from "./cuadre";

describe("el cuadre del pedido", () => {
  it("sin nada hecho, todo en «nada» y sin cobro", () => {
    const c = cuadreDelPedido({ confirmado: 10, despachado: 0, facturado: 0 }, []);
    expect(c.despachado).toEqual({ hecho: 0, de: 10, estado: "nada" });
    expect(c.facturado?.estado).toBe("nada");
    expect(c.cobrado).toEqual([]);
  });

  it("salió una parte y se facturó lo que salió", () => {
    const c = cuadreDelPedido({ confirmado: 10, despachado: 6, facturado: 6 }, [
      { tipo: "factura", total: 100, saldo: 40, moneda: "USD" },
    ]);
    expect(c.despachado).toEqual({ hecho: 6, de: 10, estado: "parte" });
    expect(c.facturado).toEqual({ hecho: 6, de: 10, estado: "parte" });
    expect(c.cobrado).toEqual([{ moneda: "USD", cobrado: 60, total: 100, estado: "parte" }]);
  });

  it("todo hecho, todo en «todo»", () => {
    const c = cuadreDelPedido({ confirmado: 4, despachado: 4, facturado: 4 }, [
      { tipo: "factura", total: 53.23, saldo: 0, moneda: "PEN" },
    ]);
    expect(c.despachado?.estado).toBe("todo");
    expect(c.facturado?.estado).toBe("todo");
    expect(c.cobrado[0]).toEqual({ moneda: "PEN", cobrado: 53.23, total: 53.23, estado: "todo" });
  });

  it("las notas de crédito no se suman: ya bajan el saldo de su factura", () => {
    const c = cuadreDelPedido({ confirmado: 1, despachado: 1, facturado: 1 }, [
      { tipo: "factura", total: 100, saldo: 0, moneda: "USD" },
      { tipo: "nota_credito", total: 20, saldo: 0, moneda: "USD" },
    ]);
    expect(c.cobrado).toEqual([{ moneda: "USD", cobrado: 100, total: 100, estado: "todo" }]);
  });

  it("una cuenta por moneda", () => {
    const c = cuadreDelPedido(null, [
      { tipo: "factura", total: 100, saldo: 100, moneda: "USD" },
      { tipo: "boleta", total: 50, saldo: 0, moneda: "PEN" },
    ]);
    expect(c.cobrado.map((x) => `${x.moneda}:${x.estado}`)).toEqual(["USD:nada", "PEN:todo"]);
    expect(c.despachado).toBeNull();
  });
});
