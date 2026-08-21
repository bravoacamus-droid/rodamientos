import { describe, expect, it } from "vitest";

import {
  aPayload,
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

  it("pero guardar queda bloqueado, con el código en el mensaje", () => {
    const e = reducir(base, { tipo: "precio", key, valor: 11.0 });
    const b = bloqueos(e);
    expect(b.some((x) => x.campo === "piso")).toBe(true);
    expect(b.find((x) => x.campo === "piso")?.mensaje).toContain("6209-2RS1/C3");
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

  it("un producto sin piso cargado no bloquea nada", () => {
    const sinPiso = { ...P6209, id: "x", precio_minimo: 0 };
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: sinPiso },
      { tipo: "precio", key: "l1", valor: 0.5 },
    );
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

  it("con varias líneas bajo el piso las cuenta y las nombra", () => {
    const e = correr(
      estadoInicial("cli"),
      { tipo: "agregar", producto: P6209 },
      { tipo: "agregar", producto: P7210 },
      { tipo: "precio", key: "l1", valor: 1 },
      { tipo: "precio", key: "l2", valor: 1 },
    );
    const m = bloqueos(e).find((x) => x.campo === "piso")?.mensaje ?? "";
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
