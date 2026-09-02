import { describe, expect, it } from "vitest";

import { sumarDias } from "@/modules/cotizaciones";

import {
  ETIQUETA_URGENCIA,
  agruparPorComprar,
  diasEntre,
  fechaPrometida,
  repartirPorProveedor,
  resumirPorComprar,
  urgenciaDe,
  type LineaComprometida,
  type PedidoPendiente,
  type ProductoPorComprar,
} from "./por-comprar";

/**
 * Lo que se prueba aquí decide cuánta mercadería se compra.
 *
 * Un número de menos es un cliente que confirmó y no recibe; uno de más es
 * dinero parado en un almacén que Willy ya describe como lleno. Las dos cosas
 * se descubren semanas después, cuando ya no se puede deshacer.
 */

const HOY = "2026-09-02";

/** Una línea con lo mínimo puesto; cada prueba cambia lo suyo. */
function linea(p: Partial<LineaComprometida> = {}): LineaComprometida {
  return {
    item_id: `it-${Math.random()}`,
    cotizacion_id: "cot-1",
    cotizacion: "COT-26-00001",
    fecha: HOY,
    cliente_id: "cli-1",
    cliente: "MINERA A",
    producto_id: "prod-1",
    codigo: "6205",
    descripcion: "RODAMIENTO RIGIDO DE BOLAS",
    marca: "SKF",
    disponibilidad: "inmediata",
    dias_entrega: null,
    comprometido: 10,
    stock: 0,
    costo_referencia: 4,
    ...p,
  };
}

const agrupar = (
  lineas: LineaComprometida[],
  pedidos: PedidoPendiente[] = [],
  hoy = HOY,
) => agruparPorComprar(lineas, pedidos, hoy, sumarDias);

describe("el fallo que este módulo existe para evitar", () => {
  it("dos clientes esperando lo mismo NO se cubren los dos con el mismo stock", () => {
    // Es el caso de la cabecera: `v_comprometido` diría falta 0 en las dos
    // líneas, porque cada una mira el stock entero.
    const filas = agrupar([
      linea({ cliente_id: "cli-1", comprometido: 10, stock: 10 }),
      linea({ cliente_id: "cli-2", comprometido: 10, stock: 10 }),
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.comprometido).toBe(20);
    expect(filas[0]?.stock).toBe(10);
    expect(filas[0]?.falta).toBe(10);
  });

  it("y el stock se le da al que confirmó primero, entero", () => {
    const filas = agrupar([
      linea({
        cliente_id: "cli-2",
        cotizacion: "COT-26-00009",
        fecha: "2026-08-30",
        comprometido: 6,
        stock: 4,
      }),
      linea({
        cliente_id: "cli-1",
        cotizacion: "COT-26-00002",
        fecha: "2026-08-25",
        comprometido: 6,
        stock: 4,
      }),
    ]);

    const [primera, segunda] = filas[0]?.lineas ?? [];
    expect(primera?.cotizacion).toBe("COT-26-00002");
    expect(primera?.cubierto).toBe(4);
    expect(primera?.descubierto).toBe(2);
    // Al segundo no le queda nada: repartir 2 y 2 dejaría a los dos sin poder
    // entregar, que es peor que servir a uno.
    expect(segunda?.cubierto).toBe(0);
    expect(segunda?.descubierto).toBe(6);
    expect(filas[0]?.falta).toBe(8);
  });

  it("el mismo día, el número de cotización desempata siempre igual", () => {
    const dos = [
      linea({ cotizacion: "COT-26-00007", comprometido: 5, stock: 5 }),
      linea({ cotizacion: "COT-26-00003", comprometido: 5, stock: 5 }),
    ];
    const a = agrupar(dos);
    const b = agrupar([...dos].reverse());

    expect(a[0]?.lineas[0]?.cotizacion).toBe("COT-26-00003");
    expect(b[0]?.lineas[0]?.cotizacion).toBe("COT-26-00003");
  });
});

describe("qué sale y qué no", () => {
  it("lo que el almacén cubre entero no es problema de compras", () => {
    expect(agrupar([linea({ comprometido: 4, stock: 10 })])).toEqual([]);
  });

  it("lo que ya está pedido sale, pero como «en camino»", () => {
    const filas = agrupar(
      [linea({ comprometido: 10, stock: 0 })],
      [
        {
          producto_id: "prod-1",
          pendiente: 10,
          compras: 1,
          proxima_llegada: "2026-09-08",
          primera_compra: "CMP-26-00014",
        },
      ],
    );

    expect(filas[0]?.estado).toBe("en_camino");
    expect(filas[0]?.falta).toBe(0);
    expect(filas[0]?.pedido).toBe(10);
    // Y se dice cuándo llega y en qué compra, o la fila no serviría de nada.
    expect(filas[0]?.proximaLlegada).toBe("2026-09-08");
    expect(filas[0]?.primeraCompra).toBe("CMP-26-00014");
  });

  it("si lo pedido no alcanza, se compra solo la diferencia", () => {
    const filas = agrupar(
      [linea({ comprometido: 30, stock: 5 })],
      [
        {
          producto_id: "prod-1",
          pendiente: 10,
          compras: 2,
          proxima_llegada: null,
          primera_compra: null,
        },
      ],
    );

    expect(filas[0]?.sinCubrir).toBe(25);
    expect(filas[0]?.pedido).toBe(10);
    expect(filas[0]?.falta).toBe(15);
    expect(filas[0]?.estado).toBe("comprar");
  });

  it("un pedido de más no vuelve negativo lo que falta", () => {
    const filas = agrupar(
      [linea({ comprometido: 10, stock: 0 })],
      [
        {
          producto_id: "prod-1",
          pendiente: 40,
          compras: 1,
          proxima_llegada: null,
          primera_compra: null,
        },
      ],
    );
    expect(filas[0]?.falta).toBe(0);
  });

  it("un stock negativo —que el kardex no debería dejar— no regala unidades", () => {
    const filas = agrupar([linea({ comprometido: 10, stock: -5 })]);
    expect(filas[0]?.falta).toBe(10);
  });

  it("cada producto va por su lado", () => {
    const filas = agrupar([
      linea({ producto_id: "prod-1", codigo: "6205" }),
      linea({ producto_id: "prod-2", codigo: "6305" }),
    ]);
    expect(filas.map((f) => f.codigo).sort()).toEqual(["6205", "6305"]);
  });

  it("cuenta clientes distintos, no líneas", () => {
    const filas = agrupar([
      linea({ cliente_id: "cli-1", cotizacion: "COT-26-00001" }),
      linea({ cliente_id: "cli-1", cotizacion: "COT-26-00002" }),
      linea({ cliente_id: "cli-2", cotizacion: "COT-26-00003" }),
    ]);
    expect(filas[0]?.clientes).toBe(2);
  });
});

describe("cuándo se prometió", () => {
  it("«inmediata» promete hoy, no el día en que se cotizó", () => {
    // Si contara desde la cotización, una de hace un mes saldría con 30 días
    // de retraso y la bandeja sería toda roja a las dos semanas.
    expect(
      fechaPrometida(
        { fecha: "2026-08-01", disponibilidad: "inmediata", dias_entrega: null },
        HOY,
        sumarDias,
      ),
    ).toBe(HOY);
  });

  it("las demás cuentan sus días desde la cotización", () => {
    expect(
      fechaPrometida(
        { fecha: "2026-09-01", disponibilidad: "exterior", dias_entrega: 15 },
        HOY,
        sumarDias,
      ),
    ).toBe("2026-09-16");
  });

  it("sin días, la fecha de la cotización: nunca una fecha inventada", () => {
    expect(
      fechaPrometida(
        { fecha: "2026-09-01", disponibilidad: "fabricacion", dias_entrega: null },
        HOY,
        sumarDias,
      ),
    ).toBe("2026-09-01");
  });

  it("manda la línea más apretada de las que no se pueden servir", () => {
    const filas = agrupar([
      linea({
        cotizacion: "COT-26-00001",
        fecha: "2026-09-01",
        disponibilidad: "exterior",
        dias_entrega: 15,
        comprometido: 5,
      }),
      linea({
        cotizacion: "COT-26-00002",
        fecha: "2026-09-01",
        disponibilidad: "inmediata",
        comprometido: 5,
      }),
    ]);
    expect(filas[0]?.prometida).toBe(HOY);
    expect(filas[0]?.urgencia).toBe("hoy");
  });

  it("una línea servida del almacén no le mete prisa a la compra", () => {
    // La inmediata se cubre con el stock; lo que hay que comprar es la de
    // exterior, y esa no vence hoy.
    const filas = agrupar([
      linea({
        cotizacion: "COT-26-00001",
        fecha: "2026-09-01",
        disponibilidad: "inmediata",
        comprometido: 5,
        stock: 5,
      }),
      linea({
        cotizacion: "COT-26-00002",
        fecha: "2026-09-01",
        disponibilidad: "exterior",
        dias_entrega: 15,
        comprometido: 5,
        stock: 5,
      }),
    ]);
    expect(filas[0]?.prometida).toBe("2026-09-16");
    expect(filas[0]?.urgencia).toBe("holgado");
  });
});

describe("cuánto aprieta", () => {
  it("los cortes", () => {
    expect(urgenciaDe(-1)).toBe("vencido");
    expect(urgenciaDe(0)).toBe("hoy");
    expect(urgenciaDe(3)).toBe("pronto");
    expect(urgenciaDe(4)).toBe("holgado");
  });

  it("todas las urgencias tienen etiqueta: ninguna sale en blanco", () => {
    for (const u of ["vencido", "hoy", "pronto", "holgado"] as const) {
      expect(ETIQUETA_URGENCIA[u]).toBeTruthy();
    }
  });

  it("los días se cuentan en Lima, sin que el huso reste uno", () => {
    expect(diasEntre("2026-09-02", "2026-09-05")).toBe(3);
    expect(diasEntre("2026-09-05", "2026-09-02")).toBe(-3);
    expect(diasEntre("2026-09-02", "2026-09-02")).toBe(0);
    // Cruzando el fin de mes, que es donde falla una resta hecha a mano.
    expect(diasEntre("2026-08-30", "2026-09-02")).toBe(3);
  });

  it("una fecha ilegible no revienta la bandeja entera", () => {
    expect(diasEntre("no es fecha", HOY)).toBe(0);
  });
});

describe("el orden de la tabla", () => {
  it("primero lo que hay que comprar, y dentro de eso lo más vencido", () => {
    const filas = agrupar(
      [
        linea({
          producto_id: "p-holgado",
          codigo: "HOLGADO",
          fecha: "2026-09-01",
          disponibilidad: "exterior",
          dias_entrega: 15,
        }),
        linea({
          producto_id: "p-camino",
          codigo: "CAMINO",
          fecha: "2026-08-01",
          disponibilidad: "exterior",
          dias_entrega: 1,
        }),
        linea({ producto_id: "p-hoy", codigo: "HOY" }),
        linea({
          producto_id: "p-vencido",
          codigo: "VENCIDO",
          fecha: "2026-08-01",
          disponibilidad: "exterior",
          dias_entrega: 5,
        }),
      ],
      [
        {
          producto_id: "p-camino",
          pendiente: 99,
          compras: 1,
          proxima_llegada: null,
          primera_compra: null,
        },
      ],
    );

    // «CAMINO» es el más vencido de todos y aun así va el último: ya se hizo
    // lo que había que hacer con él.
    expect(filas.map((f) => f.codigo)).toEqual([
      "VENCIDO",
      "HOY",
      "HOLGADO",
      "CAMINO",
    ]);
  });
});

describe("los decimales", () => {
  it("un reparto con fracciones no deja restos de coma flotante", () => {
    const filas = agrupar([
      linea({ cotizacion: "COT-26-00001", comprometido: 0.1, stock: 0.3 }),
      linea({ cotizacion: "COT-26-00002", comprometido: 0.2, stock: 0.3 }),
      linea({ cotizacion: "COT-26-00003", comprometido: 1.5, stock: 0.3 }),
    ]);
    expect(filas[0]?.comprometido).toBe(1.8);
    expect(filas[0]?.sinCubrir).toBe(1.5);
    expect(filas[0]?.falta).toBe(1.5);
  });
});

describe("el costo de referencia", () => {
  it("es el de la cotización más reciente, no el de la más vieja", () => {
    // El maestro cambia. Estimar con el costo de una cotización de hace
    // tres meses es peor que estimar con la de ayer.
    const filas = agrupar([
      linea({ cotizacion: "COT-26-00001", fecha: "2026-06-01", costo_referencia: 3 }),
      linea({ cotizacion: "COT-26-00050", fecha: "2026-09-01", costo_referencia: 5 }),
    ]);
    expect(filas[0]?.costoReferencia).toBe(5);
    expect(filas[0]?.estimado).toBe(100); // 20 que faltan × 5
  });

  it("un cero no es un costo: se busca el último que sí lo tenga", () => {
    const filas = agrupar([
      linea({ cotizacion: "COT-26-00001", fecha: "2026-06-01", costo_referencia: 3 }),
      linea({ cotizacion: "COT-26-00050", fecha: "2026-09-01", costo_referencia: 0 }),
    ]);
    expect(filas[0]?.costoReferencia).toBe(3);
  });

  it("sin ningún costo se estima cero, y no NaN", () => {
    const filas = agrupar([linea({ costo_referencia: 0 })]);
    expect(filas[0]?.costoReferencia).toBe(0);
    expect(filas[0]?.estimado).toBe(0);
  });

  it("lo que ya viene en camino no se vuelve a estimar", () => {
    const filas = agrupar(
      [linea({ comprometido: 10, costo_referencia: 4 })],
      [{ producto_id: "prod-1", pendiente: 10, compras: 1, proxima_llegada: null, primera_compra: null }],
    );
    expect(filas[0]?.estimado).toBe(0);
  });
});

describe("el resumen de la cabecera", () => {
  it("cuenta lo que se ve sin leer la tabla", () => {
    const filas = agrupar(
      [
        linea({ producto_id: "p-1", cliente_id: "cli-1" }),
        linea({
          producto_id: "p-2",
          cliente_id: "cli-2",
          fecha: "2026-08-01",
          disponibilidad: "exterior",
          dias_entrega: 5,
        }),
        linea({ producto_id: "p-3", cliente_id: "cli-1" }),
      ],
      [
        {
          producto_id: "p-3",
          pendiente: 99,
          compras: 1,
          proxima_llegada: null,
          primera_compra: null,
        },
      ],
    );

    expect(resumirPorComprar(filas)).toEqual({
      productos: 3,
      porComprar: 2,
      enCamino: 1,
      vencidos: 1,
      clientes: 2,
      // Solo lo que falta comprar: las 10 de p-1 y las 10 de p-2, a 4. Lo
      // que ya viene en camino no hay que volver a pagarlo.
      estimado: 80,
    });
  });

  it("sin nada pendiente, todo a cero y sin reventar", () => {
    expect(resumirPorComprar([])).toEqual({
      productos: 0,
      porComprar: 0,
      enCamino: 0,
      vencidos: 0,
      clientes: 0,
      estimado: 0,
    });
  });
});

/**
 * Repartir mal es peor que no repartir: manda a comprarle caro a alguien, o
 * esconde el producto que justo hay que salir a buscar.
 */
describe("repartir la compra entre proveedores", () => {
  const fila = (codigo: string, falta: number, costoRef = 10): ProductoPorComprar =>
    (agrupar([
      linea({ producto_id: `p-${codigo}`, codigo, comprometido: falta, costo_referencia: costoRef }),
    ])[0] as ProductoPorComprar);

  const A = { proveedor_id: "prov-a", proveedor: "ALFA", costoUsd: 5, veces: 3 };
  const B = { proveedor_id: "prov-b", proveedor: "BETA", costoUsd: 4, veces: 1 };

  it("cada producto va al que lo dejó más barato", () => {
    const f = fila("6205", 10);
    const g = repartirPorProveedor([f], { [f.producto_id]: [A, B] });
    expect(g).toHaveLength(1);
    expect(g[0]?.proveedor).toBe("BETA");
  });

  it("a igual precio gana el que más veces lo ha vendido", () => {
    const f = fila("6205", 10);
    const g = repartirPorProveedor([f], {
      [f.producto_id]: [{ ...A, costoUsd: 4 }, B],
    });
    expect(g[0]?.proveedor).toBe("ALFA");
  });

  it("el que nunca lo ha cobrado va detrás del que sí", () => {
    // Sin precio no se puede afirmar que sea barato.
    const f = fila("6205", 10);
    const g = repartirPorProveedor([f], {
      [f.producto_id]: [{ ...A, costoUsd: null }, { ...B, costoUsd: 99 }],
    });
    expect(g[0]?.proveedor).toBe("BETA");
  });

  it("junta en un grupo los productos del mismo proveedor", () => {
    const f1 = fila("6205", 10);
    const f2 = fila("6305", 4);
    const g = repartirPorProveedor([f1, f2], {
      [f1.producto_id]: [B],
      [f2.producto_id]: [B],
    });
    expect(g).toHaveLength(1);
    expect(g[0]?.filas.map((x) => x.codigo)).toEqual(["6205", "6305"]);
  });

  it("y los separa cuando son de proveedores distintos", () => {
    const f1 = fila("6205", 10);
    const f2 = fila("6305", 4);
    const g = repartirPorProveedor([f1, f2], {
      [f1.producto_id]: [A],
      [f2.producto_id]: [B],
    });
    expect(g).toHaveLength(2);
  });

  it("el estimado usa el costo del proveedor, no el de la cotización", () => {
    // Lo que se va a pagar, no lo que se supuso al cotizar.
    const f = fila("6205", 10, 40);
    const g = repartirPorProveedor([f], { [f.producto_id]: [B] });
    expect(g[0]?.estimado).toBe(40); // 10 que faltan × 4
  });

  it("un producto sin proveedor conocido NO se esconde: va a su propio grupo", () => {
    // Es justo el que hay que salir a buscar.
    const f = fila("RARO", 2, 15);
    const g = repartirPorProveedor([f], {});
    expect(g).toHaveLength(1);
    expect(g[0]?.proveedor_id).toBeNull();
    // Sin proveedor, el estimado se cae al costo de la cotización.
    expect(g[0]?.estimado).toBe(30);
  });

  it("los que tienen proveedor van primero, y el que más resuelve delante", () => {
    const f1 = fila("A", 1);
    const f2 = fila("B", 1);
    const f3 = fila("C", 1);
    const g = repartirPorProveedor([f1, f2, f3], {
      [f1.producto_id]: [A],
      [f2.producto_id]: [B],
      [f3.producto_id]: [B],
    });
    expect(g.map((x) => x.proveedor)).toEqual(["BETA", "ALFA"]);
  });

  it("sin nada marcado no hay grupos", () => {
    expect(repartirPorProveedor([], {})).toEqual([]);
  });
});
