import { describe, expect, it } from "vitest";

import {
  aPayload,
  avisosDeCosto,
  avisosDeVenta,
  bloqueos,
  estadoInicial,
  lineasSinStock,
  reducir,
  revisionDe,
  totalesDe,
  type EstadoConstructor,
  type ProductoParaCotizar,
} from "./constructor";

/**
 * Productos reales del archivo del cliente.
 *
 *   6209-2RS1/C3  SKF  costo 10.70  lista 12.84  piso 11.96
 *   7210 BEP      SKF  costo 34.43  lista 41.32  piso 38.76
 */
const P6209: ProductoParaCotizar = {
  id: "p-6209",
  codigo: "6209-2RS1/C3",
  descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
  marca: "SKF",
  unidad: "NIU",
  stock: 12,
  precio_venta: 12.84,
  precio_minimo: 11.96,
  costo_promedio: 10.7,
};

const P7210: ProductoParaCotizar = {
  id: "p-7210",
  codigo: "7210 BEP",
  descripcion: "RODAMIENTO DE BOLAS DE CONTACTO ANG. DE 1 HIL.",
  marca: "SKF",
  unidad: "NIU",
  stock: 0,
  precio_venta: 41.32,
  precio_minimo: 38.76,
  costo_promedio: 34.43,
};

const FAG6209: ProductoParaCotizar = {
  id: "p-fag",
  codigo: "6209 2RSR-C3",
  descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
  marca: "FAG",
  unidad: "NIU",
  stock: 5,
  precio_venta: 11.9,
  precio_minimo: 10.8,
  costo_promedio: 9.0,
};

/** Aplica varias acciones seguidas, que es como se usa de verdad. */
const correr = (
  estado: EstadoConstructor,
  ...acciones: Parameters<typeof reducir>[1][]
) => acciones.reduce(reducir, estado);

describe("agregar", () => {
  it("crea la línea con los datos del maestro", () => {
    const e = reducir(estadoInicial(), { tipo: "agregar", producto: P6209 });
    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]).toMatchObject({
      key: "l1",
      productoId: "p-6209",
      codigo: "6209-2RS1/C3",
      marca: "SKF",
      cantidad: 1,
      valorUnitario: 12.84,
      precioMinimo: 11.96,
      precioLista: 12.84,
      descuentoPct: 0,
    });
  });

  it("la marca va en su columna y NO dentro de la descripción (C2, C3)", () => {
    const e = reducir(estadoInicial(), { tipo: "agregar", producto: P6209 });
    const l = e.lineas[0]!;
    expect(l.descripcion).not.toContain("SKF");
    expect(l.descripcion).not.toContain("6209");
    expect(l.marca).toBe("SKF");
  });

  it("las claves son deterministas, no aleatorias", () => {
    const a = correr(
      estadoInicial(),
      { tipo: "agregar", producto: P6209 },
      { tipo: "agregar", producto: P7210 },
    );
    const b = correr(
      estadoInicial(),
      { tipo: "agregar", producto: P6209 },
      { tipo: "agregar", producto: P7210 },
    );
    expect(a.lineas.map((l) => l.key)).toEqual(["l1", "l2"]);
    expect(a).toEqual(b);
  });

  it("agregar dos veces el mismo producto SUMA, no duplica la línea", () => {
    // Cotizar dos veces el mismo código es un error que el cliente nota y el
    // vendedor no.
    const e = correr(
      estadoInicial(),
      { tipo: "agregar", producto: P6209, cantidad: 2 },
      { tipo: "agregar", producto: P6209, cantidad: 3 },
    );
    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]?.cantidad).toBe(5);
  });

  it("una cantidad basura cae a 1 en vez de romper el total", () => {
    const e = reducir(estadoInicial(), {
      tipo: "agregar",
      producto: P6209,
      cantidad: Number.NaN,
    });
    expect(e.lineas[0]?.cantidad).toBe(1);
  });
});

describe("negociación", () => {
  const base = correr(estadoInicial("cli"), { tipo: "agregar", producto: P6209 });
  const key = base.lineas[0]!.key;

  it("deja bajar el precio aunque rompa el piso, y lo marca", () => {
    // No se recorta al teclear: impedir la tecla obliga a adivinar el límite.
    const e = reducir(base, { tipo: "precio", key, valor: 11.0 });
    expect(e.lineas[0]?.valorUnitario).toBe(11);
    expect(revisionDe(e.lineas[0]!).ok).toBe(false);
  });

  /*
    La regla cambió el 17/09 y estos dos tests la fijan por los dos lados.

    Bajar del precio mínimo AVISA, no impide. Luis lo decidió con las tres
    opciones delante, por lo que Willy dijo el 16/09 (4:29): *«a un cliente
    puede que le dé con 20, a otro con el doble o con 50 % de margen. Eso yo
    lo manejo»*.

    Se prueban las dos mitades a propósito: que ya no bloquee **y** que siga
    avisando. Quitar el bloqueo sin dejar el aviso sería perder la advertencia
    entera, que es lo contrario de lo que se pidió.
  */
  it("bajar del piso NO impide guardar", () => {
    const e = reducir(base, { tipo: "precio", key, valor: 11.0 });
    expect(bloqueos(e).some((x) => x.campo === "piso")).toBe(false);
  });

  it("pero sí avisa, con el código en el mensaje", () => {
    const e = reducir(base, { tipo: "precio", key, valor: 11.0 });
    const a = avisosDeVenta(e);
    expect(a.some((x) => x.campo === "piso")).toBe(true);
    expect(a.find((x) => x.campo === "piso")?.mensaje).toContain("6209-2RS1/C3");
  });

  it("detecta las DOS palancas juntas", () => {
    // 12.20 con 5 % = 11.59, por debajo del piso 11.96. Cada una por separado
    // pasaba.
    expect(revisionDe(reducir(base, { tipo: "precio", key, valor: 12.2 }).lineas[0]!).ok).toBe(true);
    expect(revisionDe(reducir(base, { tipo: "descuento", key, valor: 5 }).lineas[0]!).ok).toBe(true);

    const ambas = correr(
      base,
      { tipo: "precio", key, valor: 12.2 },
      { tipo: "descuento", key, valor: 5 },
    );
    const r = revisionDe(ambas.lineas[0]!);
    expect(r.ok).toBe(false);
    expect(r.precioNeto).toBe(11.59);
  });

  it("bajarAlPiso deja la línea justo en el mínimo y sin descuento", () => {
    const e = correr(
      base,
      { tipo: "descuento", key, valor: 5 },
      { tipo: "bajarAlPiso", key },
    );
    expect(e.lineas[0]?.valorUnitario).toBe(11.96);
    expect(e.lineas[0]?.descuentoPct).toBe(0);
    expect(revisionDe(e.lineas[0]!).ok).toBe(true);
  });

  it("volverALista deshace la negociación", () => {
    const e = correr(
      base,
      { tipo: "precio", key, valor: 12.0 },
      { tipo: "descuento", key, valor: 3 },
      { tipo: "volverALista", key },
    );
    expect(e.lineas[0]?.valorUnitario).toBe(12.84);
    expect(e.lineas[0]?.descuentoPct).toBe(0);
  });

  it("el descuento se limita a 0..100", () => {
    expect(reducir(base, { tipo: "descuento", key, valor: 150 }).lineas[0]?.descuentoPct).toBe(100);
    expect(reducir(base, { tipo: "descuento", key, valor: -5 }).lineas[0]?.descuentoPct).toBe(0);
  });

  it("un producto sin piso cargado no avisa ni bloquea", () => {
    // Es el caso de casi todo el catálogo: 790 productos entraron del Excel
    // sin precio mínimo. Con el piso en 0 no hay nada que advertir.
    const sinPiso = { ...P6209, id: "x", precio_minimo: 0 };
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: sinPiso },
      { tipo: "precio", key: "l1", valor: 0.5 },
    );
    expect(avisosDeVenta(e)).toEqual([]);
    expect(bloqueos(e).some((b) => b.campo === "piso")).toBe(false);
  });
});

describe("sustituir", () => {
  it("cambia el artículo y CONSERVA la cantidad pactada", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209, cantidad: 7 },
      { tipo: "sustituir", key: "l1", producto: FAG6209 },
    );
    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]).toMatchObject({
      key: "l1",
      codigo: "6209 2RSR-C3",
      marca: "FAG",
      cantidad: 7,
      valorUnitario: 11.9,
      precioMinimo: 10.8,
    });
  });

  it("sustituir por una clave que no existe no cambia nada", () => {
    const e = correr(estadoInicial(), { tipo: "agregar", producto: P6209 });
    expect(reducir(e, { tipo: "sustituir", key: "nope", producto: FAG6209 })).toBe(e);
  });
});

describe("orden y borrado", () => {
  const dos = correr(
    estadoInicial(),
    { tipo: "agregar", producto: P6209 },
    { tipo: "agregar", producto: P7210 },
  );

  it("mover intercambia posiciones", () => {
    const e = reducir(dos, { tipo: "mover", key: "l2", direccion: -1 });
    expect(e.lineas.map((l) => l.key)).toEqual(["l2", "l1"]);
  });

  it("mover fuera de rango no hace nada", () => {
    expect(reducir(dos, { tipo: "mover", key: "l1", direccion: -1 })).toBe(dos);
    expect(reducir(dos, { tipo: "mover", key: "l2", direccion: 1 })).toBe(dos);
  });

  it("quitar elimina solo esa línea", () => {
    const e = reducir(dos, { tipo: "quitar", key: "l1" });
    expect(e.lineas.map((l) => l.codigo)).toEqual(["7210 BEP"]);
  });

  it("las claves no se reciclan tras borrar", () => {
    // Reciclarlas haría que React reutilizara el nodo de una línea borrada.
    const e = correr(
      dos,
      { tipo: "quitar", key: "l1" },
      { tipo: "agregar", producto: FAG6209 },
    );
    expect(e.lineas.map((l) => l.key)).toEqual(["l2", "l3"]);
  });
});

describe("totales", () => {
  it("coinciden con el cálculo de línea, con descuento incluido", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209, cantidad: 10 },
      { tipo: "agregar", producto: P7210, cantidad: 2 },
      { tipo: "descuento", key: "l1", valor: 5 },
    );
    const t = totalesDe(e);
    // 10 x 12.84 x 0.95 = 121.98 ; 2 x 41.32 = 82.64
    expect(t.subtotal).toBe(204.62);
    expect(t.descuentoTotal).toBe(6.42);
    expect(t.igv).toBe(36.83);
    expect(t.total).toBe(241.45);
  });

  it("una cotización vacía da todo en cero sin romperse", () => {
    const t = totalesDe(estadoInicial());
    expect(t).toMatchObject({ subtotal: 0, igv: 0, total: 0, margenPct: 0 });
  });
});

describe("bloqueos", () => {
  it("sin cliente y sin líneas, dice las dos cosas", () => {
    const b = bloqueos(estadoInicial());
    expect(b.map((x) => x.campo).sort()).toEqual(["cliente", "lineas"]);
  });

  it("una cotización correcta no tiene bloqueos", () => {
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: P6209 });
    expect(bloqueos(e)).toEqual([]);
  });

  it("con varias líneas bajo el piso las cuenta y las nombra en el AVISO", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209 },
      { tipo: "agregar", producto: P7210 },
      { tipo: "precio", key: "l1", valor: 1 },
      { tipo: "precio", key: "l2", valor: 1 },
    );
    // Dos líneas tiradas de precio y aun así se puede guardar (17/09).
    expect(bloqueos(e).some((x) => x.campo === "piso")).toBe(false);

    const m = avisosDeVenta(e).find((x) => x.campo === "piso")?.mensaje ?? "";
    expect(m).toContain("2 líneas");
    expect(m).toContain("6209-2RS1/C3");
    expect(m).toContain("7210 BEP");
  });
});

describe("stock", () => {
  it("señala las líneas que se cotizan sin stock suficiente", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209, cantidad: 5 }, // hay 12
      { tipo: "agregar", producto: P7210, cantidad: 1 }, // hay 0
    );
    expect(lineasSinStock(e).map((l) => l.codigo)).toEqual(["7210 BEP"]);
  });

  it("pedir más de lo que hay también cuenta", () => {
    const e = correr(estadoInicial("cli"), {
      tipo: "agregar",
      producto: P6209,
      cantidad: 20,
    });
    expect(lineasSinStock(e)).toHaveLength(1);
  });
});

describe("aPayload", () => {
  it("numera las líneas por su orden en pantalla", () => {
    const e = correr(
      estadoInicial("cli-1"),
      { tipo: "agregar", producto: P6209 },
      { tipo: "agregar", producto: P7210 },
      { tipo: "mover", key: "l2", direccion: -1 },
    );
    const p = aPayload(e);
    expect(p.items.map((i) => [i.orden, i.codigo])).toEqual([
      [1, "7210 BEP"],
      [2, "6209-2RS1/C3"],
    ]);
  });

  it("NUNCA manda precio_minimo_ref", () => {
    // Lo impone el trigger desde el maestro. Mandarlo por payload sería
    // ofrecer la llave del piso a quien llame.
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: P6209 });
    for (const item of aPayload(e).items) {
      expect(item).not.toHaveProperty("precio_minimo_ref");
    }
  });

  it("los campos vacíos van como null y no como cadena vacía", () => {
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: P6209 });
    const p = aPayload(e);
    expect(p.orden_compra_cliente).toBeNull();
    expect(p.observaciones).toBeNull();
  });

  it("arrastra la casilla de descuento (C5)", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209 },
      { tipo: "cabecera", campo: "mostrarDescuento", valor: true },
    );
    expect(aPayload(e).mostrar_descuento).toBe(true);
  });
});

describe("el tiempo de entrega se sincroniza con las líneas", () => {
  /**
   * Nació antes que la disponibilidad por línea (040) y se quedaba en «Stock
   * inmediato» aunque hubiera ítems de importación. El mismo papel decía dos
   * cosas —cabecera «Stock inmediato», línea «15 días · exterior»— y las dos
   * salían impresas. Pasó en la COT1-000004.
   */
  const conLinea = () =>
    reducir(estadoInicial(), { tipo: "agregar", producto: P7210, cantidad: 1 });

  it("con todo inmediato se queda en stock inmediato", () => {
    expect(conLinea().tiempoEntrega).toBe("Stock inmediato");
  });

  it("al marcar una línea como exterior, la cabecera se corrige sola", () => {
    const e = conLinea();
    const clave = e.lineas[0]!.key;
    const r = reducir(e, { tipo: "disponibilidad", key: clave, valor: "exterior" });
    expect(r.tiempoEntrega).toBe("Hasta 15 días");
  });

  it("elegirla a mano apaga la propuesta para siempre", () => {
    const e = conLinea();
    const clave = e.lineas[0]!.key;
    const aMano = reducir(e, {
      tipo: "cabecera",
      campo: "tiempoEntrega",
      valor: "24 a 48 horas",
    });
    expect(aMano.entregaAMano).toBe(true);

    // Y ya no se pisa aunque cambien las líneas: hay acuerdos que no caben en
    // una fórmula.
    const despues = reducir(aMano, {
      tipo: "disponibilidad",
      key: clave,
      valor: "exterior",
    });
    expect(despues.tiempoEntrega).toBe("24 a 48 horas");
  });

  it("quitar la línea lenta devuelve la cabecera a inmediato", () => {
    const e = conLinea();
    const clave = e.lineas[0]!.key;
    const conExterior = reducir(e, {
      tipo: "disponibilidad",
      key: clave,
      valor: "exterior",
    });
    expect(conExterior.tiempoEntrega).toBe("Hasta 15 días");

    const sinLinea = reducir(conExterior, { tipo: "quitar", key: clave });
    expect(sinLinea.tiempoEntrega).toBe("Stock inmediato");
  });

  it("un borrador que se recupera NO se recalcula", () => {
    // Lo guardado es una decisión ya tomada; pisarla sería perder lo que
    // alguien escribió hace tres días.
    const guardado: EstadoConstructor = {
      ...estadoInicial(),
      tiempoEntrega: "7 días útiles",
    };
    const r = reducir(estadoInicial(), { tipo: "cargar", estado: guardado });
    expect(r.tiempoEntrega).toBe("7 días útiles");
    expect(r.entregaAMano).toBe(true);
  });
});

describe("la marca de la línea · el caso del retén (Willy, 16/09)", () => {
  /*
    Willy: *«aparece sin marca, no me da opción a editar para grabarlo con una
    marca determinada… en el mercado de retenes los códigos se guardan con las
    medidas, como 45x60x8TC, pero puede ser diversas marcas: LYO, NQK, PHK,
    NAK… solo SKF tiene una codificación particular»*.

    O sea: el código NO identifica una marca. Hay UNA fila en el maestro para
    las cinco, y cuál se entrega se decide al cotizar. Por eso la marca se
    escribe en la línea y no en el producto.
  */
  const RETEN: ProductoParaCotizar = {
    id: "p-reten",
    codigo: "45X60X8TC",
    descripcion: "RETEN 45 X 60 X 8 TC",
    marca: null,
    unidad: "NIU",
    stock: 0,
    precio_venta: 1.5,
  };

  const conReten = () =>
    reducir(estadoInicial(), { tipo: "agregar", producto: RETEN });

  it("se le puede poner una marca que NO está en el catálogo", () => {
    // «LYO, NQK, PHK, NAK… etc». El «etc» es justo el motivo de que esto sea
    // texto libre y no una clave ajena al maestro de marcas.
    const e = correr(conReten(), {
      tipo: "marca",
      key: conReten().lineas[0]!.key,
      valor: "NQK",
    });
    expect(e.lineas[0]!.marca).toBe("NQK");
  });

  it("vaciarla la deja en «sin marca», no en cadena vacía", () => {
    // Es lo que el papel imprime como un guion y lo que la base guarda como
    // nulo. Una cadena vacía se imprimiría como un hueco.
    const base = conReten();
    const e = correr(
      base,
      { tipo: "marca", key: base.lineas[0]!.key, valor: "NAK" },
      { tipo: "marca", key: base.lineas[0]!.key, valor: "   " },
    );
    expect(e.lineas[0]!.marca).toBeNull();
  });

  it("los espacios de los bordes se recortan", () => {
    const base = conReten();
    const e = correr(base, {
      tipo: "marca",
      key: base.lineas[0]!.key,
      valor: "  PHK  ",
    });
    expect(e.lineas[0]!.marca).toBe("PHK");
  });

  it("solo toca SU línea", () => {
    const dos = correr(
      estadoInicial(),
      { tipo: "agregar", producto: RETEN },
      { tipo: "agregar", producto: P6209 },
    );
    const e = correr(dos, {
      tipo: "marca",
      key: dos.lineas[0]!.key,
      valor: "LYO",
    });
    expect(e.lineas[0]!.marca).toBe("LYO");
    expect(e.lineas[1]!.marca).toBe(P6209.marca);
  });

  it("la marca editada es la que viaja al guardar", () => {
    // Si se quedara solo en la pantalla, el papel saldría «SIN MARCA» igual y
    // el arreglo no serviría de nada.
    const base = conReten();
    const e = correr(base, {
      tipo: "marca",
      key: base.lineas[0]!.key,
      valor: "NQK",
    });
    expect(aPayload(e).items[0]!.marca).toBe("NQK");
  });
});

describe("avisosDeCosto", () => {
  /*
    Comprobado con números reales el 25/09. El UCF208D1 tenía el mínimo en
    29.53, puesto cuando costaba 28.12. Entró una importación, el costo subió a
    30.00 y el mínimo se quedó donde estaba: la pantalla daba por buena una
    venta que pierde 0.47 por unidad, y el botón «dejar en el mínimo» llevaba
    ahí de un clic.
  */
  const caro = { ...P6209, id: "c1", precio_venta: 29.53, costo_promedio: 30, precio_minimo: 29.53 };

  it("avisa cuando el precio queda bajo el costo AUNQUE respete el piso", () => {
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: caro });
    // El piso está contento: 29.53 no baja de 29.53.
    expect(avisosDeVenta(e)).toEqual([]);
    // Y sin embargo pierde dinero.
    expect(avisosDeCosto(e)).toHaveLength(1);
    expect(avisosDeCosto(e)[0]?.mensaje).toMatch(/POR DEBAJO DE SU COSTO/);
  });

  it("el descuento también cuenta: se mira el precio neto", () => {
    const sano = { ...P6209, id: "c2", precio_venta: 40, costo_promedio: 30, precio_minimo: 0 };
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: sano });
    expect(avisosDeCosto(e)).toEqual([]);
    // 40 con 30 % de descuento son 28, por debajo de los 30 que cuesta.
    const conDscto = reducir(e, { tipo: "descuento", key: "l1", valor: 30 });
    expect(avisosDeCosto(conDscto)).toHaveLength(1);
  });

  it("un producto SIN costo no se juzga: cero no es gratis, es no se sabe", () => {
    const sinCosto = { ...P6209, id: "c3", precio_venta: 5, costo_promedio: 0, ultimo_costo: 0, precio_minimo: 0 };
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: sinCosto });
    expect(avisosDeCosto(e)).toEqual([]);
  });

  it("vender por encima del costo no avisa nada", () => {
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: P6209 });
    expect(avisosDeCosto(e)).toEqual([]);
  });
});

describe("refrescarKit", () => {
  /*
    El kit se edita desde la cotización (25/09). Willy (8:25): el precio del
    kit en la cotización se puede cambiar y vale solo para ella. Lo propuesto
    se actualiza; lo tecleado se queda.
  */
  const KIT = {
    ...P6209,
    id: "kit1",
    codigo: "KIT-MOTOR",
    descripcion: "KIT MOTORREDUCTOR",
    marca: null,
    precio_venta: 100,
    costo_promedio: 0,
    ultimo_costo: 70,
    precio_minimo: 80,
    es_kit: true,
  };
  const nuevo = {
    ...KIT,
    codigo: "KIT-MOTOR-2",
    descripcion: "KIT MOTORREDUCTOR COMPLETO",
    precio_venta: 130,
    ultimo_costo: 90,
    precio_minimo: 100,
  };
  const anterior = { codigo: "KIT-MOTOR", descripcion: "KIT MOTORREDUCTOR" };

  it("la línea sabe que es un kit", () => {
    const e = correr(estadoInicial("cli"), { tipo: "agregar", producto: KIT });
    expect(e.lineas[0]?.esKit).toBe(true);
  });

  it("si nadie tocó el precio, sigue al kit", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: KIT },
      { tipo: "refrescarKit", key: "l1", producto: nuevo, anterior },
    );
    expect(e.lineas[0]?.valorUnitario).toBe(130);
    expect(e.lineas[0]?.codigo).toBe("KIT-MOTOR-2");
    expect(e.lineas[0]?.costoUnitario).toBe(90);
  });

  it("si alguien bajó el precio a mano, NO se pisa", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: KIT },
      { tipo: "precio", key: "l1", valor: 95 },
      { tipo: "refrescarKit", key: "l1", producto: nuevo, anterior },
    );
    expect(e.lineas[0]?.valorUnitario).toBe(95);
    // Pero el de lista sí sabe el nuevo: el modal de precios lo enseña.
    expect(e.lineas[0]?.precioLista).toBe(130);
  });

  it("no toca cantidad ni descuento: son de esta cotización", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: KIT, cantidad: 3 },
      { tipo: "descuento", key: "l1", valor: 5 },
      { tipo: "refrescarKit", key: "l1", producto: nuevo, anterior },
    );
    expect(e.lineas[0]?.cantidad).toBe(3);
    expect(e.lineas[0]?.descuentoPct).toBe(5);
  });
});
