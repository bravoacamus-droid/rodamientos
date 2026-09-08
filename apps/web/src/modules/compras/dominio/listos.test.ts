import { describe, expect, it } from "vitest";

import { sumarDias } from "@/modules/cotizaciones";

import { alcanzaPara, avisosDeCantidad, pedidosListos, quienEspera } from "./listos";
import type { LineaComprometida } from "./por-comprar";

/**
 * De aquí sale a quién se le dice «ya lo tienes».
 *
 * Un pedido dado por listo que no lo está es una llamada al cliente para nada
 * y un almacén que va a buscar mercadería que no hay. Y uno listo que no
 * aparece es un cliente esperando encima de un estante lleno — que es
 * exactamente lo que pasaba hasta hoy, con TODOS.
 */

const HOY = "2026-09-04";

function linea(p: Partial<LineaComprometida> = {}): LineaComprometida {
  return {
    item_id: `it-${Math.random()}`,
    cotizacion_id: "cot-1",
    cotizacion: "COT-26-00001",
    fecha: "2026-08-20",
    cliente_id: "cli-1",
    cliente: "INDUSTRIAL TECHNOLOGY",
    producto_id: "prod-1",
    codigo: "6205",
    descripcion: "RODAMIENTO RIGIDO DE BOLAS",
    marca: "SKF",
    disponibilidad: "inmediata",
    dias_entrega: null,
    comprometido: 10,
    stock: 0,
    costo_referencia: 8.2,
    ...p,
  };
}

describe("pedidosListos", () => {
  it("con stock de sobra, el pedido sale completo", () => {
    const r = pedidosListos([linea({ comprometido: 10, stock: 25 })], HOY, sumarDias);
    expect(r).toHaveLength(1);
    expect(r[0]!.estado).toBe("completo");
    expect(r[0]!.unidades).toBe(10);
    expect(r[0]!.cubiertas).toBe(1);
  });

  it("sin stock sale como «por cubrir», no desaparece", () => {
    // Hasta el 08/09 este pedido no salía. Sonaba razonable —«es trabajo de
    // compras»— y dejaba al cliente sin aparecer en ninguna pantalla como
    // pedido entre que se aprobaba y que llegaba la mercadería: la bandeja
    // «Por comprar» lo tiene, pero repartido por código.
    const r = pedidosListos([linea({ comprometido: 10, stock: 0 })], HOY, sumarDias);
    expect(r).toHaveLength(1);
    expect(r[0]!.estado).toBe("por_cubrir");
    expect(r[0]!.unidades).toBe(0);
    expect(r[0]!.pendientes).toBe(10);
    expect(r[0]!.cubiertas).toBe(0);
  });

  it("los tres montones salen en orden: cubierto, parcial y por cubrir", () => {
    // El orden importa porque es el del trabajo, y porque el comparador tuvo
    // que dejar de ser `es completo ? -1 : 1` al aparecer el tercer estado:
    // con tres, esa forma devuelve 1 en los DOS sentidos al comparar un
    // parcial con un «por cubrir» y el resultado queda a merced del sort.
    const r = pedidosListos(
      [
        linea({ cotizacion_id: "c-vacio", cotizacion: "C-3", producto_id: "p1", comprometido: 5, stock: 0 }),
        linea({ cotizacion_id: "c-lleno", cotizacion: "C-1", producto_id: "p2", comprometido: 5, stock: 5 }),
        linea({ cotizacion_id: "c-medio", cotizacion: "C-2", producto_id: "p3", comprometido: 5, stock: 2 }),
      ],
      HOY,
      sumarDias,
    );
    expect(r.map((p) => p.estado)).toEqual(["completo", "parcial", "por_cubrir"]);
  });

  it("una línea a medias también sale: esas unidades se pueden entregar hoy", () => {
    // Pide 10, hay 4. Ninguna línea entera, pero 4 se facturan por partes.
    // Cortando por líneas completas este pedido no salía en NINGUNA pantalla.
    const r = pedidosListos([linea({ comprometido: 10, stock: 4 })], HOY, sumarDias);
    expect(r).toHaveLength(1);
    expect(r[0]!.estado).toBe("parcial");
    expect(r[0]!.unidades).toBe(4);
    expect(r[0]!.cubiertas).toBe(0);
  });

  it("con una línea cubierta y otra no, sale como parcial", () => {
    // Se factura por partes desde la 047, así que un parcial también se mueve.
    const r = pedidosListos(
      [
        linea({ producto_id: "p1", comprometido: 5, stock: 5 }),
        linea({ producto_id: "p2", comprometido: 5, stock: 0 }),
      ],
      HOY,
      sumarDias,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.estado).toBe("parcial");
    expect(r[0]!.cubiertas).toBe(1);
    expect(r[0]!.lineas).toBe(2);
    expect(r[0]!.unidades).toBe(5);
  });

  it("el stock se reparte por antigüedad, no se cuenta dos veces", () => {
    // 12 unidades y dos pedidos de 10. El viejo se lleva 10, al nuevo le
    // quedan 2: NO están los dos listos, que es lo que diría contar el stock
    // del producto contra cada pedido por separado.
    const r = pedidosListos(
      [
        linea({ cotizacion_id: "vieja", cotizacion: "COT-1", fecha: "2026-08-01", stock: 12 }),
        linea({ cotizacion_id: "nueva", cotizacion: "COT-2", fecha: "2026-08-30", stock: 12 }),
      ],
      HOY,
      sumarDias,
    );
    expect(r.map((p) => [p.cotizacion_id, p.estado])).toEqual([
      ["vieja", "completo"],
      ["nueva", "parcial"],
    ]);
    expect(r[1]!.unidades).toBe(2);
  });

  it("los completos van delante, y dentro manda el que lleva más esperando", () => {
    const r = pedidosListos(
      [
        linea({ cotizacion_id: "b", cotizacion: "COT-B", fecha: "2026-08-25", producto_id: "p1", stock: 10 }),
        linea({ cotizacion_id: "a", cotizacion: "COT-A", fecha: "2026-08-10", producto_id: "p2", stock: 10 }),
        linea({ cotizacion_id: "c", cotizacion: "COT-C", fecha: "2026-08-01", producto_id: "p3", comprometido: 10, stock: 4 }),
      ],
      HOY,
      sumarDias,
    );
    // «c» es el más antiguo de todos y va el último: está a medias.
    expect(r.map((p) => p.cotizacion_id)).toEqual(["a", "b", "c"]);
  });

  it("una lista vacía no revienta", () => {
    expect(pedidosListos([], HOY, sumarDias)).toEqual([]);
  });
});

describe("quienEspera", () => {
  it("dice quién espera ese producto y cuánto", () => {
    const r = quienEspera(
      ["prod-1"],
      [
        linea({ cotizacion_id: "a", cotizacion: "COT-A", cliente: "MINERA A", comprometido: 20 }),
        linea({ cotizacion_id: "b", cotizacion: "COT-B", cliente: "MINERA B", comprometido: 15 }),
      ],
      HOY,
      sumarDias,
    );
    const p = r.get("prod-1")!;
    expect(p.total).toBe(35);
    expect(p.pedidos.map((x) => x.cliente)).toEqual(["MINERA A", "MINERA B"]);
  });

  it("no cuenta a quien ya se le puede servir del almacén", () => {
    // 20 en stock y dos de 20: el primero ya está servido y NO está esperando
    // esta compra. Contarlo diría que hacen falta 40 cuando hacen falta 20.
    const r = quienEspera(
      ["prod-1"],
      [
        linea({ cotizacion_id: "a", cotizacion: "COT-A", fecha: "2026-08-01", comprometido: 20, stock: 20 }),
        linea({ cotizacion_id: "b", cotizacion: "COT-B", fecha: "2026-08-30", comprometido: 20, stock: 20 }),
      ],
      HOY,
      sumarDias,
    );
    const p = r.get("prod-1")!;
    expect(p.total).toBe(20);
    expect(p.pedidos.map((x) => x.cotizacion_id)).toEqual(["b"]);
  });

  it("ordena por lo prometido, no por la fecha del pedido", () => {
    // Uno de hace un mes con 15 días de plazo aprieta MENOS que uno de ayer
    // que se prometió inmediato.
    const r = quienEspera(
      ["prod-1"],
      [
        linea({
          cotizacion_id: "viejo",
          cotizacion: "COT-V",
          fecha: "2026-08-25",
          disponibilidad: "exterior",
          dias_entrega: 30,
        }),
        linea({
          cotizacion_id: "nuevo",
          cotizacion: "COT-N",
          fecha: "2026-09-03",
          disponibilidad: "inmediata",
        }),
      ],
      HOY,
      sumarDias,
    );
    expect(r.get("prod-1")!.pedidos.map((p) => p.cotizacion_id)).toEqual([
      "nuevo",
      "viejo",
    ]);
  });

  it("un producto que no espera nadie no aparece", () => {
    expect(quienEspera(["otro"], [linea()], HOY, sumarDias).has("otro")).toBe(false);
  });
});

describe("alcanzaPara", () => {
  const espera = (total: number) => ({ producto_id: "p", pedidos: [], total });

  it("distingue «alcanza» de «no espera nadie»", () => {
    // Reponer stock es normal, y decir «alcanza» daría a entender que hay
    // alguien a quien avisar.
    expect(alcanzaPara(50, undefined)).toBe("nadie");
    expect(alcanzaPara(50, espera(0))).toBe("nadie");
    expect(alcanzaPara(50, espera(35))).toBe("alcanza");
  });

  it("avisa cuando la compra deja a alguien fuera", () => {
    expect(alcanzaPara(30, espera(35))).toBe("no_alcanza");
  });

  it("justo lo que hace falta sí alcanza", () => {
    expect(alcanzaPara(35, espera(35))).toBe("alcanza");
  });
});

describe("avisosDeCantidad", () => {
  const espera = (total: number, clientes: string[] = ["c1"]) => ({
    producto_id: "p1",
    total,
    pedidos: clientes.map((cliente_id) => ({
      cotizacion_id: `cot-${cliente_id}`,
      cotizacion: `COT-${cliente_id}`,
      cliente_id,
      cliente: cliente_id,
      fecha: "2026-08-20",
      esperando: total / clientes.length,
      prometida: "2026-09-04",
      dias: 0,
      urgencia: "hoy" as const,
    })),
  });

  it("avisa de lo que falta, con cuántos clientes lo esperan", () => {
    // El caso de Luis: tres clientes con el mismo producto y una compra
    // hecha pensando solo en uno.
    const r = avisosDeCantidad(
      [{ producto_id: "p1", cantidad: 5 }],
      { p1: espera(15, ["c1", "c2", "c3"]) },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.faltan).toBe(10);
    expect(r[0]!.esperan).toBe(15);
    expect(r[0]!.clientes).toBe(3);
  });

  it("NO dice nada cuando se compra de más", () => {
    // Reponer almacén es deliberado. Regañar por eso hace que se dejen de
    // leer los avisos, incluidos los que sí importan.
    expect(avisosDeCantidad([{ producto_id: "p1", cantidad: 50 }], { p1: espera(12) }))
      .toEqual([]);
  });

  it("justo lo que hace falta no es un aviso", () => {
    expect(avisosDeCantidad([{ producto_id: "p1", cantidad: 12 }], { p1: espera(12) }))
      .toEqual([]);
  });

  it("un producto que no espera nadie no genera aviso", () => {
    expect(avisosDeCantidad([{ producto_id: "otro", cantidad: 1 }], { p1: espera(12) }))
      .toEqual([]);
  });

  it("cuenta clientes distintos, no pedidos", () => {
    // El mismo cliente con dos pedidos es UN cliente al que llamar.
    const r = avisosDeCantidad(
      [{ producto_id: "p1", cantidad: 0 }],
      { p1: espera(10, ["c1", "c1"]) },
    );
    expect(r[0]!.clientes).toBe(1);
  });
});
