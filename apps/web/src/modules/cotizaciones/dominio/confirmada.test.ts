import { describe, expect, it } from "vitest";

import { aPayload, cantidadQueLleva, estadoInicial, lineasSinAnalizar, reducir, totalesDe, type EstadoConstructor } from "./constructor";

// La COT1-000009 al editarla: la B-118 la confirmó en 0 (114).
function pedido(): EstadoConstructor {
  let e = reducir(estadoInicial("cli"), {
    tipo: "agregar",
    producto: { id: "p1", codigo: "XPA2000", descripcion: "Faja", marca: null, precio_venta: 10 },
  });
  e = reducir(e, {
    tipo: "agregar",
    producto: { id: "p2", codigo: "B-118", descripcion: "Faja", marca: null, precio_venta: 13 },
  });
  return { ...e, lineas: e.lineas.map((l, i) => ({ ...l, confirmada: i === 0 ? 1 : 0 })) };
}

describe("editar un pedido aprobado (114)", () => {
  it("la que no quiso no cuenta en el total ni pide análisis", () => {
    const e = pedido();
    expect(totalesDe(e).subtotal).toBe(10);
    expect(lineasSinAnalizar(e).map((l) => l.codigo)).toEqual(["XPA2000"]);
  });

  it("volver a incluirla la confirma entera, y quitarla otra vez la deja en 0", () => {
    const key = pedido().lineas[1]?.key ?? "";
    const dentro = reducir(pedido(), { tipo: "incluir", key, incluida: true });
    expect(dentro.lineas[1]?.confirmada).toBe(1);
    expect(totalesDe(dentro).subtotal).toBe(23);
    expect(reducir(dentro, { tipo: "incluir", key, incluida: false }).lineas[1]?.confirmada).toBe(0);
  });

  it("lo confirmado sigue a la cantidad si iba entero, y una línea fuera sigue fuera", () => {
    const e = pedido();
    const [a, b] = e.lineas;
    const sube = reducir(e, { tipo: "cantidad", key: a?.key ?? "", valor: 5 });
    expect(sube.lineas[0]?.confirmada).toBe(5);
    expect(reducir(e, { tipo: "cantidad", key: b?.key ?? "", valor: 4 }).lineas[1]?.confirmada).toBe(0);
  });

  it("viaja a la base; en una cotización sin aprobar va en null", () => {
    expect(aPayload(pedido()).items.map((i) => i.cantidad_aprobada)).toEqual([1, 0]);
    const libre = reducir(estadoInicial("cli"), {
      tipo: "agregar",
      producto: { id: "p1", codigo: "X", descripcion: "x", marca: null, precio_venta: 1 },
    });
    expect(aPayload(libre).items[0]?.cantidad_aprobada).toBeNull();
    expect(cantidadQueLleva(libre.lineas[0]!)).toBe(1);
  });
});
