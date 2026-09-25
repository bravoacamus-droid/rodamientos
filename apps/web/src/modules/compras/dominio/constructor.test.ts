import { describe, expect, it } from "vitest";

import {
  aPayload,
  avisos,
  bloqueos,
  estadoInicial,
  importeLinea,
  reducir,
  aplicarPlantilla,
  totalesDe,
  type PlantillaCompra,
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

/**
 * Pone dinero en el gasto de ese concepto; si no está entre los propuestos,
 * lo añade. Busca por concepto y no por clave para que los tests no dependan
 * del orden en que se proponen los gastos.
 */
function conGasto(estado: EstadoCompra, concepto: string, monto: number): EstadoCompra {
  let e = estado;
  let g = e.gastos.find((x) => x.concepto === concepto);
  if (!g) {
    e = reducir(e, { tipo: "gastoAgregar", concepto });
    g = e.gastos[e.gastos.length - 1];
  }
  return reducir(e, { tipo: "gastoMonto", key: g!.key, valor: monto });
}

const redondear = (n: number) => Math.round(n * 100) / 100;

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
    const estado = conGasto(
      construir(
        { tipo: "modalidad", valor: "aerea" },
        { tipo: "afectoIgv", valor: false },
        { tipo: "agregar", producto: P6205, cantidad: 10 },
        { tipo: "agregar", producto: P7210, cantidad: 4 },
      ),
      "Courier",
      25,
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

  /*
    LA REGLA CAMBIÓ EL 25/09, y a propósito. Hasta entonces «una compra local
    ignora los gastos» era verdad y este test lo fijaba. Willy, 24/09 (§AO.4):
    *«a la compra local se le puede poner un gasto de transporte también,
    porque es un gasto al final»*. Si alguien vuelve a poner la regla vieja,
    el transporte de las compras de Lima deja de entrar al costo.
  */
  it("una compra local SÍ cuenta su transporte", () => {
    const estado = conGasto(
      construir({ tipo: "agregar", producto: P6205, cantidad: 10 }),
      "Transporte",
      15,
    );

    expect(estado.tipo).toBe("local");
    expect(totalesDe(estado).gastos).toBe(15);
    expect(totalesDe(estado).costoEnAlmacen).toBe(redondear(10 * 3.26 + 15));
  });

  it("cambiar de modalidad NO borra un gasto que alguien escribió", () => {
    // Se teclea el courier en aérea, y luego se decide que era local.
    const aerea = conGasto(construir({ tipo: "modalidad", valor: "aerea" }), "Courier", 40);
    const local = reducir(aerea, { tipo: "modalidad", valor: "local" });

    // El dinero sigue ahí, a la vista, para quitarlo a mano si sobra. Borrarlo
    // en silencio sería sacar 40 del costo sin que nadie se entere.
    expect(totalesDe(local).gastos).toBe(40);
    expect(local.gastos.some((g) => g.concepto === "Courier")).toBe(true);
  });

  it("cambiar de modalidad SIN dinero escrito trae los gastos de la nueva", () => {
    const e = construir({ tipo: "modalidad", valor: "maritima" });
    const conceptos = e.gastos.map((g) => g.concepto);
    expect(conceptos).toContain("Flete marítimo");
    expect(conceptos).toContain("Levante");
    expect(conceptos).not.toContain("Transporte");
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

  it("una compra local no arrastra vía, courier ni tracking", () => {
    const estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "modalidad", valor: "aerea" },
      { tipo: "cabecera", campo: "courier", valor: "DHL" },
      { tipo: "cabecera", campo: "tracking", valor: "7712345678" },
      { tipo: "agregar", producto: P6205 },
      { tipo: "modalidad", valor: "local" },
    );
    const payload = aPayload(estado);

    expect(payload.tipo).toBe("local");
    expect(payload.via_importacion).toBeNull();
    expect(payload.courier).toBeNull();
    expect(payload.tracking).toBeNull();
  });

  it("la marítima viaja con su vía y solo los gastos con dinero", () => {
    let estado = construir(
      { tipo: "cabecera", campo: "proveedorId", valor: "33333333-3333-3333-3333-333333333333" },
      { tipo: "modalidad", valor: "maritima" },
      { tipo: "agregar", producto: P6205 },
    );
    estado = conGasto(estado, "Flete marítimo", 100);
    estado = conGasto(estado, "Derechos de aduana", 50);
    const payload = aPayload(estado);

    expect(payload.tipo).toBe("importacion");
    expect(payload.via_importacion).toBe("maritima");
    // Las otras cinco propuestas siguen en pantalla vacías, y NO viajan: un
    // gasto de cero en la ficha diría que se pagó y salió gratis.
    expect(payload.gastos).toEqual([
      { concepto: "Flete marítimo", monto: 100 },
      { concepto: "Derechos de aduana", monto: 50 },
    ]);
    expect(payload.gastos_importacion).toBe(150);
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

describe("el costo que se propone al agregar", () => {
  /*
    Willy, 24/09 (18:00), registrando una compra: «tendría que jalarme aquí el
    precio y el costo, no me lo estás jalando, pero debería jalarme aquí los
    2.50 que hemos puesto anteriormente».

    Había escrito 2.50 en el «P.C. — costo» de la ficha, que se guarda en
    `ultimo_costo`, y aquí solo se leía `costo_promedio`. En los 793 productos
    que entraron del Excel sin recepciones —o sea, en casi todos— eso es cero.
  */
  const sinKardex: ProductoParaComprar = {
    ...P6205,
    id: "33333333-3333-3333-3333-333333333333",
    costo_promedio: 0,
    ultimo_costo: 2.5,
  };

  it("sin kardex, propone lo que dice la ficha", () => {
    const e = construir({ tipo: "agregar", producto: sinKardex });
    expect(e.lineas[0]?.costoUnitario).toBe(2.5);
    expect(e.lineas[0]?.costoAnterior).toBe(2.5);
  });

  it("con kardex, el kardex manda sobre la ficha", () => {
    const conAmbos: ProductoParaComprar = { ...sinKardex, costo_promedio: 3.26 };
    expect(construir({ tipo: "agregar", producto: conAmbos }).lineas[0]?.costoUnitario).toBe(3.26);
  });

  it("sin ninguno de los dos, cero y marcado como propuesto", () => {
    const pelado: ProductoParaComprar = { ...sinKardex, costo_promedio: 0, ultimo_costo: 0 };
    const l = construir({ tipo: "agregar", producto: pelado }).lineas[0];
    expect(l?.costoUnitario).toBe(0);
    expect(l?.costoPropuesto).toBe(true);
  });
});

describe("de dónde dice que salió el costo", () => {
  /*
    «Promedio» y «ficha» son dos números distintos que se escriben igual.
    Llamar «promedio» a lo que salió de la ficha es peor que no decir nada:
    uno es lo que de verdad se pagó, el otro lo que alguien anotó.
  */
  it("con kardex, lo marca como del kardex", () => {
    const e = construir({ tipo: "agregar", producto: P6205 });
    expect(e.lineas[0]?.costoDelKardex).toBe(true);
  });

  it("sin kardex, NO lo marca: el número vino de la ficha", () => {
    const soloFicha: ProductoParaComprar = {
      ...P6205,
      id: "44444444-4444-4444-4444-444444444444",
      costo_promedio: 0,
      ultimo_costo: 2.5,
    };
    expect(construir({ tipo: "agregar", producto: soloFicha }).lineas[0]?.costoDelKardex).toBe(false);
  });
});

describe("volver a comprar (aplicarPlantilla)", () => {
  const aerea: PlantillaCompra = {
    numero: "CMP-26-00006",
    modalidad: "aerea",
    courier: "DHL",
    gastos: [
      { concepto: "Courier", monto: 40 },
      { concepto: "Desaduanaje", monto: 20 },
    ],
    entera: true,
    afectoIgv: false,
    moneda: "USD",
  };

  /*
    Se vio probándolo el 25/09: la CMP-26-00006 se registró sin IGV, y al
    repetirla la casilla salía marcada y el resumen sumaba 43.20 de un impuesto
    que aquel proveedor no cobra.
  */
  it("trae si la factura llevaba IGV", () => {
    const e = aplicarPlantilla(construir(), aerea);
    expect(e.afectoIgv).toBe(false);
  });

  it("trae la moneda pero NO el tipo de cambio: ese es el de aquel día", () => {
    const e = aplicarPlantilla(construir(), { ...aerea, moneda: "PEN" });
    expect(e.moneda).toBe("PEN");
    expect(e.tipoCambio).toBe(0);
  });

  it("trae la vía, el courier y los gastos de aquella compra", () => {
    const e = aplicarPlantilla(construir(), aerea);
    expect(e.tipo).toBe("importacion");
    expect(e.via).toBe("aerea");
    expect(e.courier).toBe("DHL");
    expect(totalesDe(e).gastos).toBe(60);
  });

  it("NO copia el tracking: es de aquel envío", () => {
    const e = aplicarPlantilla(
      construir({ tipo: "cabecera", campo: "tracking", valor: "viejo" }),
      aerea,
    );
    // El tracking de partida no lo pone la plantilla; y la plantilla no trae.
    expect(aplicarPlantilla(construir(), aerea).tracking).toBe("");
    expect(e.tracking).toBe("viejo");
  });

  /*
    El courier de una importación de cinco productos no es el de uno solo.
    Traerlo entero a una compra de un producto inflaría su costo.
  */
  it("si se repite UN producto, los gastos no se rellenan", () => {
    const e = aplicarPlantilla(construir(), { ...aerea, entera: false });
    expect(e.via).toBe("aerea");
    expect(e.courier).toBe("DHL");
    expect(totalesDe(e).gastos).toBe(0);
    // Quedan las propuestas vacías de la modalidad, para rellenar a mano.
    expect(e.gastos.map((g) => g.concepto)).toEqual(["Courier", "Desaduanaje"]);
  });

  it("una local repetida no se inventa courier", () => {
    const e = aplicarPlantilla(construir(), {
      numero: "CMP-26-00005",
      modalidad: "local",
      courier: "DHL",
      gastos: [{ concepto: "Transporte", monto: 10 }],
      entera: true,
      afectoIgv: true,
      moneda: "USD",
    });
    expect(e.tipo).toBe("local");
    expect(e.courier).toBe("");
    expect(totalesDe(e).gastos).toBe(10);
  });
});
