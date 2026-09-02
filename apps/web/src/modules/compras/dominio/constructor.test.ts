import { describe, expect, it } from "vitest";

import {
  aPayload,
  avisos,
  bloqueos,
  estadoInicial,
  importeLinea,
  reducir,
  totalesDe,
  type EstadoCompra,
  type ProductoParaComprar,
} from "./constructor";

/**
 * Los números esperados NO están calculados a mano: salen de ejecutar la misma
 * aritmética en el Postgres del proyecto, que es quien tiene la última palabra
 * porque `compra_items.importe` es una columna generada.
 */

const FECHA = "2026-08-25";

const P6205: ProductoParaComprar = {
  id: "11111111-1111-1111-1111-111111111111",
  codigo: "6205-2RS1/C3",
  descripcion: "RODAMIENTO RIGIDO DE BOLAS 1 HIL.",
  marca: "SKF",
  unidad: "NIU",
  stock: 35,
  costo_promedio: 3.26,
  stock_minimo: 8,
};

const P7210: ProductoParaComprar = {
  id: "22222222-2222-2222-2222-222222222222",
  codigo: "7210 BEP",
  descripcion: "RODAMIENTO DE BOLAS DE CONTACTO ANG. DE 1 HIL.",
  marca: "SKF",
  unidad: "NIU",
  stock: 8,
  costo_promedio: 34.43,
  stock_minimo: 4,
};

/** Atajo: aplica una lista de acciones sobre el estado inicial. */
function construir(...acciones: Parameters<typeof reducir>[1][]): EstadoCompra {
  return acciones.reduce(reducir, estadoInicial(FECHA));
}

describe("importeLinea", () => {
  /**
   * El caso que obligó a escribir `importeExacto`. Con el redondeo ingenuo
   * —`redondear2(cantidad * costo)`— esto daba 3.01, porque `3 * 1.005` ya
   * vale 3.0149999999999997 en coma flotante. Postgres, con `numeric`, da 3.02.
   */
  it("cuadra con Postgres en el medio céntimo", () => {
    expect(importeLinea({ cantidad: 3, costoUnitario: 1.005 })).toBe(3.02);
  });

  it("cuadra con Postgres en los demás casos frontera", () => {
    expect(importeLinea({ cantidad: 7, costoUnitario: 2.455 })).toBe(17.19);
    expect(importeLinea({ cantidad: 1, costoUnitario: 0.125 })).toBe(0.13);
    expect(importeLinea({ cantidad: 3, costoUnitario: 0.005 })).toBe(0.02);
    expect(importeLinea({ cantidad: 12, costoUnitario: 8.3333 })).toBe(100);
  });
});

describe("totalesDe", () => {
  /**
   * Comprobado contra la base: `crear_compra` devolvió
   * subtotal 170.32 · igv 0 · total 170.32 para estas mismas dos líneas.
   */
  it("una importación sin IGV suma solo los importes", () => {
    const estado = construir(
      { tipo: "tipoCompra", valor: "importacion" },
      { tipo: "afectoIgv", valor: false },
      { tipo: "gastos", valor: 25 },
      { tipo: "agregar", producto: P6205, cantidad: 10 },
      { tipo: "agregar", producto: P7210, cantidad: 4 },
    );

    const t = totalesDe(estado);
    expect(t.subtotal).toBe(170.32);
    expect(t.igv).toBe(0);
    expect(t.total).toBe(170.32);
    expect(t.gastos).toBe(25);
    // El IGV no entra en el costo —es crédito fiscal— pero los gastos sí.
    expect(t.costoEnAlmacen).toBe(195.32);
    expect(t.lineas).toBe(2);
    expect(t.unidades).toBe(14);
  });

  /**
   * Mismas líneas, afectas: la base devolvió igv 30.66 y total 200.98.
   */
  it("con IGV coincide con lo que calculó la base", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205, cantidad: 10 },
      { tipo: "agregar", producto: P7210, cantidad: 4 },
    );

    const t = totalesDe(estado);
    expect(t.subtotal).toBe(170.32);
    expect(t.igv).toBe(30.66);
    expect(t.total).toBe(200.98);
  });

  it("una compra local ignora los gastos aunque el estado los tuviera", () => {
    const estado = construir(
      { tipo: "tipoCompra", valor: "importacion" },
      { tipo: "gastos", valor: 40 },
      { tipo: "agregar", producto: P6205, cantidad: 10 },
      { tipo: "tipoCompra", valor: "local" },
    );

    expect(totalesDe(estado).gastos).toBe(0);
    expect(estado.gastosImportacion).toBe(0);
  });

  it("sin líneas todo vale cero", () => {
    const t = totalesDe(estadoInicial(FECHA));
    expect(t).toMatchObject({ subtotal: 0, igv: 0, total: 0, lineas: 0, unidades: 0 });
  });
});

describe("reducir", () => {
  it("elegir dos veces el mismo producto SUMA a la línea que ya está", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205, cantidad: 10 },
      { tipo: "agregar", producto: P6205, cantidad: 5 },
    );

    // No es cosmético: `compra_items` tiene UNIQUE (compra_id, producto_id).
    expect(estado.lineas).toHaveLength(1);
    expect(estado.lineas[0]!.cantidad).toBe(15);
  });

  it("propone el costo promedio vigente y no cero", () => {
    const estado = construir({ tipo: "agregar", producto: P6205 });
    expect(estado.lineas[0]!.costoUnitario).toBe(3.26);
    expect(estado.lineas[0]!.costoAnterior).toBe(3.26);
  });

  it("las claves de fila son deterministas", () => {
    const a = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "agregar", producto: P7210 },
    );
    const b = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "agregar", producto: P7210 },
    );
    expect(a.lineas.map((l) => l.key)).toEqual(b.lineas.map((l) => l.key));
    expect(a.lineas.map((l) => l.key)).toEqual(["k1", "k2"]);
  });

  it("una cantidad basura cae a 1 en vez de romper el total", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205, cantidad: 10 },
      { tipo: "cantidad", key: "k1", valor: Number.NaN },
    );
    expect(estado.lineas[0]!.cantidad).toBe(1);
  });

  it("un costo negativo cae a cero", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: -5 },
    );
    expect(estado.lineas[0]!.costoUnitario).toBe(0);
  });

  it("pasar a local suelta tracking y courier", () => {
    const estado = construir(
      { tipo: "tipoCompra", valor: "importacion" },
      { tipo: "cabecera", campo: "tracking", valor: "1Z999" },
      { tipo: "cabecera", campo: "courier", valor: "DHL" },
      { tipo: "tipoCompra", valor: "local" },
    );
    expect(estado.tracking).toBe("");
    expect(estado.courier).toBe("");
  });

  it("quitar una línea no toca las demás", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "agregar", producto: P7210 },
      { tipo: "quitar", key: "k1" },
    );
    expect(estado.lineas).toHaveLength(1);
    expect(estado.lineas[0]!.codigo).toBe("7210 BEP");
  });
});

describe("bloqueos", () => {
  it("dice los tres motivos, no un booleano", () => {
    const lista = bloqueos({ ...estadoInicial(FECHA), fecha: "ayer" });
    expect(lista.map((b) => b.campo).sort()).toEqual(["fecha", "lineas", "proveedor"]);
  });

  it("con proveedor y una línea ya no bloquea", () => {
    const estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "agregar", producto: P6205 },
    );
    expect(bloqueos(estado)).toEqual([]);
  });
});

describe("avisos", () => {
  it("avisa del costo cero", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: 0 },
    );
    expect(avisos(estado)).toHaveLength(1);
    expect(avisos(estado)[0]!.mensaje).toContain("costo cero");
  });

  it("avisa de un salto de costo del 50 % o más", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: 6 },
    );
    expect(avisos(estado)[0]!.mensaje).toContain("decimal");
  });

  it("una subida normal de precio no molesta", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: 3.6 },
    );
    expect(avisos(estado)).toEqual([]);
  });

  it("avisa si aun comprando se queda por debajo del mínimo", () => {
    const bajo: ProductoParaComprar = { ...P7210, stock: 1, stock_minimo: 10 };
    const estado = construir({ tipo: "agregar", producto: bajo, cantidad: 2 });
    expect(avisos(estado)[0]!.mensaje).toContain("por debajo del mínimo");
  });

  it("el costo cero no encadena el aviso de variación", () => {
    const estado = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: 0 },
    );
    // Un solo aviso, no dos: el ruido esconde lo importante.
    expect(avisos(estado)).toHaveLength(1);
  });
});

describe("aPayload", () => {
  it("no manda ningún importe: el dinero lo calcula Postgres", () => {
    const estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "agregar", producto: P6205, cantidad: 10 },
    );
    const payload = aPayload(estado);

    expect(Object.keys(payload)).not.toContain("subtotal");
    expect(Object.keys(payload)).not.toContain("igv");
    expect(Object.keys(payload)).not.toContain("total");
    expect(Object.keys(payload.items[0]!)).toEqual([
      "producto_id",
      "cantidad",
      "costo_unitario",
      "unidad_codigo",
    ]);
  });

  it("una compra local no arrastra los campos de importación", () => {
    const estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "tipoCompra", valor: "importacion" },
      { tipo: "gastos", valor: 25 },
      { tipo: "cabecera", campo: "courier", valor: "DHL" },
      { tipo: "agregar", producto: P6205 },
      { tipo: "tipoCompra", valor: "local" },
    );
    const payload = aPayload(estado);

    expect(payload.gastos_importacion).toBe(0);
    expect(payload.courier).toBeNull();
    expect(payload.tracking).toBeNull();
  });

  it("los textos en blanco viajan como null, no como cadena vacía", () => {
    const estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "cabecera", campo: "documentoProveedor", valor: "   " },
      { tipo: "agregar", producto: P6205 },
    );
    expect(aPayload(estado).documento_proveedor).toBeNull();
    expect(aPayload(estado).fecha_estimada).toBeNull();
  });
});

/**
 * El sistema ya sabe lo que cada proveedor cobró la última vez y lo enseñaba
 * debajo del campo. Que hubiera que teclearlo igual era copiar un número de un
 * sitio a otro de la misma pantalla, cinco veces por compra.
 */
describe("proponer los costos del proveedor", () => {
  const COSTOS = { [P6205.id]: 3.1, [P7210.id]: 33 };

  it("rellena lo que el sistema había propuesto", () => {
    const e = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costosDelProveedor", costos: COSTOS },
    );
    expect(e.lineas[0]?.costoUnitario).toBe(3.1);
  });

  it("NO pisa lo que alguien escribió, aunque se cambie de proveedor", () => {
    // Puede haber tecleado el precio que le acaban de dar por teléfono, y ese
    // manda sobre cualquier histórico.
    const e = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costo", key: "k1", valor: 2.5 },
      { tipo: "costosDelProveedor", costos: COSTOS },
    );
    expect(e.lineas[0]?.costoUnitario).toBe(2.5);
  });

  it("cambiar de proveedor vuelve a proponer sobre lo ya propuesto", () => {
    const e = construir(
      { tipo: "agregar", producto: P6205 },
      { tipo: "costosDelProveedor", costos: COSTOS },
      { tipo: "costosDelProveedor", costos: { [P6205.id]: 4 } },
    );
    expect(e.lineas[0]?.costoUnitario).toBe(4);
  });

  it("un producto que ese proveedor nunca vendió se queda como estaba", () => {
    const e = construir(
      { tipo: "agregar", producto: P7210 },
      { tipo: "costosDelProveedor", costos: { [P6205.id]: 3.1 } },
    );
    // El promedio del maestro, que es lo que se propuso al añadirlo.
    expect(e.lineas[0]?.costoUnitario).toBe(34.43);
  });

  it("un costo de cero no se propone: no es un dato, es un hueco", () => {
    const e = construir(
      { tipo: "agregar", producto: P7210 },
      { tipo: "costosDelProveedor", costos: { [P7210.id]: 0 } },
    );
    expect(e.lineas[0]?.costoUnitario).toBe(34.43);
  });

  it("escribir un cero SÍ es una decisión y se respeta", () => {
    const e = construir(
      { tipo: "agregar", producto: P7210 },
      { tipo: "costo", key: "k1", valor: 0 },
      { tipo: "costosDelProveedor", costos: { [P7210.id]: 33 } },
    );
    expect(e.lineas[0]?.costoUnitario).toBe(0);
    expect(e.lineas[0]?.costoPropuesto).toBe(false);
  });

  it("sin líneas no revienta", () => {
    expect(construir({ tipo: "costosDelProveedor", costos: COSTOS }).lineas).toEqual([]);
  });
});
