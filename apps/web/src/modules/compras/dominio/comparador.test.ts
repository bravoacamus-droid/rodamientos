import { describe, expect, it } from "vitest";

import {
  aUsdSinIgv,
  compararTodo,
  comprasPropuestas,
  costoParaCompra,
  eleccionFinal,
  eleccionPorDefecto,
  estadoDeFila,
  ganadorDe,
  resumirComparativa,
  repartir,
  resumirProveedores,
  type Celda,
  type FilaComparada,
  type ItemConsultado,
  type ProveedorConsultado,
  type Respuesta,
} from "./comparador";

function proveedor(over: Partial<ProveedorConsultado> = {}): ProveedorConsultado {
  return {
    consulta_proveedor_id: "cp1",
    proveedor_id: "p1",
    proveedor: "Alfa",
    estado: "respondio",
    moneda: "USD",
    tipo_cambio: null,
    incluye_igv: false,
    validez_hasta: null,
    dias_entrega: null,
    nota: null,
    tipoProveedor: "local",
    ...over,
  };
}

function item(over: Partial<ItemConsultado> = {}): ItemConsultado {
  return {
    item_id: "i1",
    producto_id: "prod1",
    codigo: "6205",
    descripcion: "Rodamiento 6205",
    marca: "SKF",
    unidad: "NIU",
    cantidad: 10,
    ...over,
  };
}

function celda(over: Partial<Celda> = {}): Celda {
  return {
    item_id: "i1",
    consulta_proveedor_id: "cp1",
    proveedor: "Alfa",
    preguntada: true,
    respondida: true,
    costo: 10,
    costoUsd: 10,
    dias: null,
    disponible: true,
    // Sin dato: tiene las que se le pidieron, que es lo que valen todas las
    // respuestas anteriores al 090.
    cantidadDisponible: null,
    nota: null,
    ...over,
  };
}

describe("aUsdSinIgv", () => {
  it("deja en paz un precio en dólares sin IGV", () => {
    expect(aUsdSinIgv(9, "USD", null, false)).toBe(9);
  });

  it("quita el IGV cuando viene dentro", () => {
    // 11.80 con IGV son 10.00 limpios.
    expect(aUsdSinIgv(11.8, "USD", null, true)).toBe(10);
  });

  it("convierte soles con el tipo de cambio", () => {
    expect(aUsdSinIgv(37, "PEN", 3.7, false)).toBe(10);
  });

  it("hace las dos cosas, y da lo mismo que la vista de la 055", () => {
    // El centinela de la migración comprueba este caso exacto contra
    // `v_comparativa_precios`: S/ 37.00 con IGV a 3.70 son $ 8.4746. Si
    // alguien cambia una de las dos cuentas, la otra falla.
    expect(aUsdSinIgv(37, "PEN", 3.7, true)).toBe(8.4746);
  });

  it("devuelve null si faltan soles sin tipo de cambio", () => {
    // Es el fallo de la 042: sin esto el costo entra multiplicado por casi
    // cuatro y no salta ningún error.
    expect(aUsdSinIgv(37, "PEN", null, false)).toBeNull();
    expect(aUsdSinIgv(37, "PEN", 0, false)).toBeNull();
  });

  it("devuelve null si no hay precio", () => {
    expect(aUsdSinIgv(null, "USD", null, false)).toBeNull();
  });

  it("no acepta un precio negativo", () => {
    expect(aUsdSinIgv(-1, "USD", null, false)).toBeNull();
  });

  it("acepta el cero, que es un precio que alguien puede dar", () => {
    // Una muestra, o un producto que regala con el pedido. Es distinto de
    // «no lo tengo», y esa diferencia la lleva `disponible`.
    expect(aUsdSinIgv(0, "USD", null, false)).toBe(0);
  });
});

describe("costoParaCompra", () => {
  it("no convierte la moneda: la compra se cuadra contra la factura del proveedor", () => {
    expect(costoParaCompra(37, false)).toBe(37);
  });

  it("pero sí quita el IGV, porque la cabecera de la compra lo suma aparte", () => {
    expect(costoParaCompra(11.8, true)).toBe(10);
  });
});

describe("ganadorDe", () => {
  it("gana el más barato en dólares", () => {
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10 }),
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costoUsd: 8 }),
    ]);
    expect(g?.proveedor).toBe("Beta");
    expect(g?.ahorroUnitario).toBe(2);
    expect(g?.segundo).toBe("Alfa");
  });

  it("un «no lo tengo» no compite aunque tenga precio apuntado", () => {
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10 }),
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costoUsd: 1, disponible: false }),
    ]);
    expect(g?.proveedor).toBe("Alfa");
  });

  it("un hueco tampoco gana por valer cero", () => {
    // Es la trampa de cualquier rejilla de precios: el que no contestó
    // ganaría siempre.
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10 }),
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costo: null, costoUsd: null }),
    ]);
    expect(g?.proveedor).toBe("Alfa");
    expect(g?.segundo).toBeNull();
  });

  it("a igual precio gana el plazo más corto", () => {
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10, dias: 15 }),
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costoUsd: 10, dias: 3 }),
    ]);
    expect(g?.proveedor).toBe("Beta");
  });

  it("y a igual plazo, el nombre — para que no cambie entre dos cargas", () => {
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costoUsd: 10, dias: 5 }),
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10, dias: 5 }),
    ]);
    expect(g?.proveedor).toBe("Alfa");
  });

  it("un plazo sin decir va detrás de cualquiera que sí lo diga", () => {
    const g = ganadorDe([
      celda({ consulta_proveedor_id: "a", proveedor: "Alfa", costoUsd: 10, dias: null }),
      celda({ consulta_proveedor_id: "b", proveedor: "Beta", costoUsd: 10, dias: 30 }),
    ]);
    expect(g?.proveedor).toBe("Beta");
  });

  it("sin ninguna respuesta válida no hay ganador", () => {
    expect(ganadorDe([celda({ disponible: false })])).toBeNull();
    expect(ganadorDe([])).toBeNull();
  });

  it("con un solo proveedor no hay ahorro que enseñar", () => {
    const g = ganadorDe([celda({ costoUsd: 10 })]);
    expect(g?.ahorroUnitario).toBeNull();
    expect(g?.segundo).toBeNull();
  });
});

describe("compararTodo", () => {
  const items = [
    item({ item_id: "i1", producto_id: "p1", codigo: "6205", cantidad: 10 }),
    item({ item_id: "i2", producto_id: "p2", codigo: "6206", cantidad: 4 }),
  ];
  const proveedores = [
    proveedor({
      consulta_proveedor_id: "a",
      proveedor_id: "pa",
      proveedor: "Alfa",
      moneda: "PEN",
      tipo_cambio: 3.7,
      incluye_igv: true,
      dias_entrega: 3,
    }),
    proveedor({
      consulta_proveedor_id: "b",
      proveedor_id: "pb",
      proveedor: "Beta",
      dias_entrega: 15,
    }),
  ];
  const respuestas: Respuesta[] = [
    { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 37, dias_entrega: null, disponible: true, nota: null },
    { item_id: "i2", consulta_proveedor_id: "a", costo_unitario: null, dias_entrega: null, disponible: false, nota: "no lo trabajo" },
    { item_id: "i1", consulta_proveedor_id: "b", costo_unitario: 9, dias_entrega: null, disponible: true, nota: null },
    { item_id: "i2", consulta_proveedor_id: "b", costo_unitario: 2.5, dias_entrega: null, disponible: true, nota: null },
  ];

  it("normaliza cada celda y elige ganador por fila", () => {
    const filas = compararTodo(items, proveedores, respuestas);
    expect(filas).toHaveLength(2);

    // S/ 37.00 con IGV a 3.70 = $ 8.4746, que gana a los $ 9.00 de Beta.
    expect(filas[0]?.ganador?.proveedor).toBe("Alfa");
    expect(filas[0]?.celdas[0]?.costoUsd).toBe(8.4746);
    expect(filas[0]?.totalGanador).toBe(84.75);

    // El segundo producto solo lo tiene Beta.
    expect(filas[1]?.ganador?.proveedor).toBe("Beta");
    expect(filas[1]?.ganador?.segundo).toBeNull();
  });

  it("hereda el plazo de la cabecera cuando la línea no trae el suyo", () => {
    const filas = compararTodo(items, proveedores, respuestas);
    expect(filas[0]?.celdas[0]?.dias).toBe(3);
    expect(filas[0]?.celdas[1]?.dias).toBe(15);
  });

  it("un proveedor que no contestó nada deja celdas vacías, no ceros", () => {
    const filas = compararTodo(items, proveedores, []);
    expect(filas[0]?.celdas[0]?.costoUsd).toBeNull();
    expect(filas[0]?.celdas[0]?.disponible).toBe(false);
    expect(filas[0]?.ganador).toBeNull();
  });

  it("distingue «no ha contestado» de «me dijo que no lo tiene»", () => {
    // La pantalla ponía «no lo tiene» en las dos, que es acusar a alguien
    // de algo que no dijo — y dar por cerrada una pregunta abierta.
    const filas = compararTodo(items, proveedores, respuestas);
    // Alfa contestó que el segundo no lo trabaja.
    expect(filas[1]?.celdas[0]?.respondida).toBe(true);
    expect(filas[1]?.celdas[0]?.disponible).toBe(false);

    // Y aquí no ha contestado nadie.
    const mudas = compararTodo(items, proveedores, []);
    expect(mudas[1]?.celdas[0]?.respondida).toBe(false);
    expect(mudas[1]?.celdas[0]?.disponible).toBe(false);
  });

  it("mantiene una celda por proveedor consultado, en su orden", () => {
    const filas = compararTodo(items, proveedores, respuestas);
    for (const fila of filas) {
      expect(fila.celdas.map((c) => c.proveedor)).toEqual(["Alfa", "Beta"]);
    }
  });
});

describe("resumirProveedores y resumirComparativa", () => {
  const items = [
    item({ item_id: "i1", producto_id: "p1", cantidad: 10 }),
    item({ item_id: "i2", producto_id: "p2", cantidad: 4 }),
  ];
  const proveedores = [
    proveedor({ consulta_proveedor_id: "a", proveedor_id: "pa", proveedor: "Alfa" }),
    proveedor({ consulta_proveedor_id: "b", proveedor_id: "pb", proveedor: "Beta" }),
  ];
  // Alfa gana el primero por poco; Beta gana el segundo, pero Beta puede con
  // los dos y Alfa no.
  const respuestas: Respuesta[] = [
    { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 8, dias_entrega: 3, disponible: true, nota: null },
    { item_id: "i1", consulta_proveedor_id: "b", costo_unitario: 9, dias_entrega: 15, disponible: true, nota: null },
    { item_id: "i2", consulta_proveedor_id: "b", costo_unitario: 2, dias_entrega: 15, disponible: true, nota: null },
  ];

  const filas = compararTodo(items, proveedores, respuestas);
  const resumenes = resumirProveedores(filas, proveedores);

  it("cuenta qué cubre y qué gana cada uno", () => {
    const alfa = resumenes.find((r) => r.proveedor === "Alfa");
    const beta = resumenes.find((r) => r.proveedor === "Beta");

    expect(alfa?.cubre).toBe(1);
    expect(alfa?.gana).toBe(1);
    expect(alfa?.totalGanado).toBe(80);
    // No lo tiene todo: ese null contesta «¿puedo resolverlo con una llamada?»
    expect(alfa?.totalSiTodo).toBeNull();

    expect(beta?.cubre).toBe(2);
    expect(beta?.gana).toBe(1);
    expect(beta?.totalSiTodo).toBe(98);
  });

  it("dice cuánto cuesta la comodidad de comprárselo todo a uno", () => {
    const r = resumirComparativa(filas, resumenes);
    expect(r.productos).toBe(2);
    expect(r.sinNadie).toBe(0);
    expect(r.totalRepartido).toBe(88); // 10×8 + 4×2
    expect(r.mejorUnico).toEqual({ proveedor: "Beta", total: 98 });
    expect(r.costeDeUnSoloProveedor).toBe(10);
  });

  it("el plazo del pedido repartido es el del último en llegar", () => {
    const r = resumirComparativa(filas, resumenes);
    expect(r.diasMaximo).toBe(15);
  });

  it("cuenta los que no tiene nadie, que son los que hay que salir a buscar", () => {
    // «No lo tiene nadie» es que los dos contestaron que no. Los dos «no».
    const items3 = [...items, item({ item_id: "i3", producto_id: "p3", cantidad: 1 })];
    const negativas: Respuesta[] = [
      ...respuestas,
      { item_id: "i3", consulta_proveedor_id: "a", costo_unitario: null, dias_entrega: null, disponible: false, nota: null },
      { item_id: "i3", consulta_proveedor_id: "b", costo_unitario: null, dias_entrega: null, disponible: false, nota: null },
    ];
    const conHuerfano = compararTodo(items3, proveedores, negativas);
    const r = resumirComparativa(conHuerfano, resumirProveedores(conHuerfano, proveedores));
    expect(r.sinNadie).toBe(1);
    expect(r.esperando).toBe(0);
  });

  it("no da por perdido lo que solo está esperando respuesta", () => {
    // El fallo que vio Luis: la pantalla decía «2 productos no los tiene
    // nadie» con los dos proveedores todavía en «Esperando». Acusar de un
    // «no» a quien no ha contestado manda a comprar fuera sin necesidad.
    const items3 = [...items, item({ item_id: "i3", producto_id: "p3", cantidad: 1 })];
    const conPendiente = compararTodo(items3, proveedores, respuestas);
    const r = resumirComparativa(conPendiente, resumirProveedores(conPendiente, proveedores));
    expect(r.sinNadie).toBe(0);
    expect(r.esperando).toBe(1);
  });

  it("sin nadie que pueda con todo, no hay mejor único", () => {
    const soloAlfa = compararTodo(items, [proveedores[0]!], [respuestas[0]!]);
    const r = resumirComparativa(soloAlfa, resumirProveedores(soloAlfa, [proveedores[0]!]));
    expect(r.mejorUnico).toBeNull();
    expect(r.costeDeUnSoloProveedor).toBeNull();
  });

  it("ordena por quién gana más, que es a quién se le va a pedir", () => {
    expect(resumenes[0]?.gana).toBeGreaterThanOrEqual(resumenes[1]?.gana ?? 0);
  });
});

describe("comprasPropuestas", () => {
  const items = [
    item({ item_id: "i1", producto_id: "p1", codigo: "6205", cantidad: 10 }),
    item({ item_id: "i2", producto_id: "p2", codigo: "6206", cantidad: 4 }),
  ];
  const proveedores = [
    proveedor({
      consulta_proveedor_id: "a",
      proveedor_id: "pa",
      proveedor: "Alfa",
      moneda: "PEN",
      tipo_cambio: 3.7,
      incluye_igv: true,
    }),
    proveedor({ consulta_proveedor_id: "b", proveedor_id: "pb", proveedor: "Beta" }),
  ];
  const respuestas: Respuesta[] = [
    { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 37, dias_entrega: null, disponible: true, nota: null },
    { item_id: "i2", consulta_proveedor_id: "b", costo_unitario: 2.5, dias_entrega: null, disponible: true, nota: null },
  ];
  const filas = compararTodo(items, proveedores, respuestas);

  it("saca una compra por proveedor, en la moneda de cada uno", () => {
    const compras = comprasPropuestas(filas, proveedores, eleccionPorDefecto(filas));
    expect(compras).toHaveLength(2);

    const alfa = compras.find((c) => c.proveedor === "Alfa");
    expect(alfa?.moneda).toBe("PEN");
    expect(alfa?.tipo_cambio).toBe(3.7);
    // S/ 37.00 traía el IGV dentro: a la compra entra el neto, S/ 31.3559.
    // Convertirlo a dólares aquí sería el error — la compra se cuadra contra
    // la factura en soles que el proveedor va a entregar.
    expect(alfa?.lineas[0]?.costo_unitario).toBe(31.3559);
    expect(alfa?.subtotal).toBe(313.56);
  });

  it("no toca el precio del que ya venía sin IGV", () => {
    const compras = comprasPropuestas(filas, proveedores, eleccionPorDefecto(filas));
    const beta = compras.find((c) => c.proveedor === "Beta");
    expect(beta?.lineas[0]?.costo_unitario).toBe(2.5);
    expect(beta?.subtotal).toBe(10);
  });

  it("lo que no está elegido no se compra", () => {
    const compras = comprasPropuestas(filas, proveedores, { i1: "a" });
    expect(compras).toHaveLength(1);
    expect(compras[0]?.proveedor).toBe("Alfa");
  });

  it("se puede mover una línea a otro proveedor a mano", () => {
    // Que es todo el motivo de que la elección sea un parámetro y no el
    // ganador a secas: agrupar por comodidad lo decide Willy.
    const conAmbos: Respuesta[] = [
      ...respuestas,
      { item_id: "i1", consulta_proveedor_id: "b", costo_unitario: 9, dias_entrega: null, disponible: true, nota: null },
    ];
    const f = compararTodo(items, proveedores, conAmbos);
    const compras = comprasPropuestas(f, proveedores, { i1: "b", i2: "b" });
    expect(compras).toHaveLength(1);
    expect(compras[0]?.lineas).toHaveLength(2);
  });

  it("no propone comprarle a quien dijo que no lo tiene", () => {
    const compras = comprasPropuestas(filas, proveedores, { i2: "a" });
    expect(compras).toHaveLength(0);
  });

  it("ni cuando faltan soles sin tipo de cambio", () => {
    const sinTc = [proveedores[0]!, { ...proveedores[1]! }];
    sinTc[0] = { ...sinTc[0]!, tipo_cambio: null };
    const f = compararTodo(items, sinTc, respuestas);
    // La celda no se puede comparar, así que no gana nada...
    expect(f[0]?.ganador).toBeNull();
    // ...pero si alguien la elige a mano, la compra SÍ sale: el importe va en
    // soles y no necesita conversión. Lo que faltaba era poder compararlo.
    const compras = comprasPropuestas(f, sinTc, { i1: "a" });
    expect(compras[0]?.lineas[0]?.costo_unitario).toBe(31.3559);
    expect(compras[0]?.tipo_cambio).toBeNull();
  });
});

describe("eleccionPorDefecto", () => {
  it("propone el ganador de cada producto y deja fuera los que no tiene nadie", () => {
    const items = [
      item({ item_id: "i1", producto_id: "p1" }),
      item({ item_id: "i2", producto_id: "p2" }),
    ];
    const proveedores = [proveedor({ consulta_proveedor_id: "a", proveedor: "Alfa" })];
    const filas = compararTodo(items, proveedores, [
      { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 5, dias_entrega: null, disponible: true, nota: null },
    ]);
    expect(eleccionPorDefecto(filas)).toEqual({ i1: "a" });
  });
});

describe("eleccionFinal", () => {
  const items = [
    item({ item_id: "i1", producto_id: "p1", cantidad: 5 }),
    item({ item_id: "i2", producto_id: "p2", cantidad: 2 }),
  ];
  const proveedores = [
    proveedor({ consulta_proveedor_id: "a", proveedor_id: "pa", proveedor: "Alfa" }),
    proveedor({ consulta_proveedor_id: "b", proveedor_id: "pb", proveedor: "Beta" }),
  ];

  /** Solo ha contestado Beta, y caro. */
  const soloBeta: Respuesta[] = [
    { item_id: "i1", consulta_proveedor_id: "b", costo_unitario: 2.1, dias_entrega: null, disponible: true, nota: null },
    { item_id: "i2", consulta_proveedor_id: "b", costo_unitario: 180, dias_entrega: null, disponible: true, nota: null },
  ];
  /** Y después contesta Alfa, más barato en el primero. */
  const conAlfa: Respuesta[] = [
    ...soloBeta,
    { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 1.81, dias_entrega: null, disponible: true, nota: null },
  ];

  it("la respuesta que llega después SÍ puede ganar", () => {
    // El fallo que tenía la pantalla: mezclaba dando prioridad a lo ya
    // elegido, así que el primero en contestar se quedaba con todo. Las
    // respuestas nunca llegan a la vez — se anota la del lunes y la del
    // miércoles— así que pasaba siempre.
    const antes = compararTodo(items, proveedores, soloBeta);
    expect(eleccionFinal(antes, {})).toEqual({ i1: "b", i2: "b" });

    const despues = compararTodo(items, proveedores, conAlfa);
    expect(eleccionFinal(despues, {})).toEqual({ i1: "a", i2: "b" });
  });

  it("pero lo que se movió a mano se queda quieto", () => {
    const despues = compararTodo(items, proveedores, conAlfa);
    // Aunque Alfa sea más barato, si alguien puso Beta a mano, manda.
    expect(eleccionFinal(despues, { i1: "b" })).toEqual({ i1: "b", i2: "b" });
  });

  it("y lo que se quitó a mano no vuelve porque llegue otra oferta", () => {
    const despues = compararTodo(items, proveedores, conAlfa);
    expect(eleccionFinal(despues, { i2: null })).toEqual({ i1: "a" });
  });

  it("un producto que no tiene nadie no entra en la elección", () => {
    const filas = compararTodo(items, proveedores, []);
    expect(eleccionFinal(filas, {})).toEqual({});
  });
});

describe("celdas que nunca se preguntaron", () => {
  const items = [
    item({ item_id: "i1", producto_id: "p1", codigo: "TMAS100-005" }),
    item({ item_id: "i2", producto_id: "p2", codigo: "50X68X8TC" }),
  ];
  const proveedores = [
    proveedor({ consulta_proveedor_id: "skf", proveedor_id: "a", proveedor: "SKF PERU" }),
    proveedor({ consulta_proveedor_id: "ret", proveedor_id: "b", proveedor: "RETENES SUR" }),
  ];

  it("distingue «no se le preguntó» de «no ha contestado»", () => {
    // El caso de Luis: a cada proveedor solo lo suyo. Sin esto, media rejilla
    // eran huecos que se leían como respuestas pendientes.
    const filas = compararTodo(items, proveedores, [], new Set(["i1|skf", "i2|ret"]));

    expect(filas[0]?.celdas[0]?.preguntada).toBe(true); // chapas al de SKF
    expect(filas[0]?.celdas[1]?.preguntada).toBe(false); // chapas al de retenes
    expect(filas[1]?.celdas[0]?.preguntada).toBe(false);
    expect(filas[1]?.celdas[1]?.preguntada).toBe(true);
  });

  it("sin el dato, todo cuenta como preguntado", () => {
    // Es lo que significaban las rondas anteriores a la 058, y las que se
    // hacen preguntando lo mismo a todos.
    const filas = compararTodo(items, proveedores, []);
    expect(filas[0]?.celdas.every((c) => c.preguntada)).toBe(true);
  });

  it("una celda no preguntada tampoco compite por ganar", () => {
    // Se apoya en lo de siempre: sin precio no hay ganador. Pero conviene
    // dejarlo escrito, porque es lo que impide que un producto se le compre a
    // quien nunca dijo que lo tuviera.
    const filas = compararTodo(
      items,
      proveedores,
      [
        { item_id: "i1", consulta_proveedor_id: "skf", costo_unitario: 30, dias_entrega: null, disponible: true, nota: null },
      ],
      new Set(["i1|skf", "i2|ret"]),
    );
    expect(filas[0]?.ganador?.proveedor).toBe("SKF PERU");
    expect(filas[1]?.ganador).toBeNull();
  });
});

describe("estadoDeFila", () => {
  const items = [item({ item_id: "i1", producto_id: "p1" })];
  const proveedores = [
    proveedor({ consulta_proveedor_id: "a", proveedor: "Alfa" }),
    proveedor({ consulta_proveedor_id: "b", proveedor: "Beta" }),
  ];
  const todas = new Set(["i1|a", "i1|b"]);

  it("mientras alguien no contesta, es ESPERANDO y no «nadie lo tiene»", () => {
    // Decir «nadie lo tiene» antes de que nadie haya contestado es dar por
    // cerrada una pregunta abierta, y manda a buscar fuera algo que quizá
    // llegue mañana.
    const filas = compararTodo(items, proveedores, [], todas);
    expect(estadoDeFila(filas[0]!)).toBe("esperando");
  });

  it("solo cuando TODOS contestaron que no, es «nadie»", () => {
    const filas = compararTodo(
      items,
      proveedores,
      [
        { item_id: "i1", consulta_proveedor_id: "a", costo_unitario: null, dias_entrega: null, disponible: false, nota: null },
        { item_id: "i1", consulta_proveedor_id: "b", costo_unitario: null, dias_entrega: null, disponible: false, nota: null },
      ],
      todas,
    );
    expect(estadoDeFila(filas[0]!)).toBe("nadie");
  });

  it("con una oferta, resuelto", () => {
    const filas = compararTodo(
      items,
      proveedores,
      [{ item_id: "i1", consulta_proveedor_id: "a", costo_unitario: 5, dias_entrega: null, disponible: true, nota: null }],
      todas,
    );
    expect(estadoDeFila(filas[0]!)).toBe("resuelto");
  });

  it("si no se le preguntó a nadie, lo dice: es un descuido, no una respuesta", () => {
    const filas = compararTodo(items, proveedores, [], new Set<string>());
    expect(estadoDeFila(filas[0]!)).toBe("sin_preguntar");
  });
});

/*
  El reparto entre proveedores, con el ejemplo de Willy tal cual.

  Willy, 21/09, por chat: *«si yo necesito comprar para atender 10 unidades de
  un producto, el proveedor A tiene stock suficiente a $8 y el proveedor B lo
  tiene a $6 pero solo cuenta con 6 unidades… ¿con qué precio de costo
  trabajo?»* — y su propia respuesta: *«se tomaría el 1er mejor precio con la
  cantidad que tiene; si falta, se promedia con el 2do mejor precio con la
  cantidad que tenga; y así sucesivamente»*.
*/
describe("repartir", () => {
  const fila = (celdas: Celda[], cantidad = 10): FilaComparada => ({
    item: item({ cantidad }),
    celdas,
    ganador: ganadorDe(celdas),
    totalGanador: null,
  });

  it("el caso de Willy: 6 a $6 y 4 a $8 dan $6.80", () => {
    const r = repartir(
      fila([
        celda({ consulta_proveedor_id: "A", proveedor: "A", costoUsd: 8 }),
        celda({
          consulta_proveedor_id: "B",
          proveedor: "B",
          costoUsd: 6,
          cantidadDisponible: 6,
        }),
      ]),
    );

    expect(r.tramos).toHaveLength(2);
    // El más barato primero: es como lo dictó.
    expect(r.tramos[0]).toMatchObject({ proveedor: "B", cantidad: 6, costoUsd: 6 });
    expect(r.tramos[1]).toMatchObject({ proveedor: "A", cantidad: 4, costoUsd: 8 });
    expect(r.cubierto).toBe(10);
    expect(r.falta).toBe(0);
    // (6×6 + 4×8) / 10 = 6.80
    expect(r.costoPonderado).toBe(6.8);
  });

  it("si el más barato tiene de sobra, no entra nadie más", () => {
    const r = repartir(
      fila([
        celda({ consulta_proveedor_id: "A", proveedor: "A", costoUsd: 8 }),
        celda({ consulta_proveedor_id: "B", proveedor: "B", costoUsd: 6 }),
      ]),
    );
    expect(r.tramos).toHaveLength(1);
    expect(r.tramos[0]).toMatchObject({ proveedor: "B", cantidad: 10 });
    expect(r.costoPonderado).toBe(6);
  });

  /**
   * Sin este caso, las rondas anteriores al 090 se quedarían sin reparto:
   * ninguna respuesta vieja tiene cantidad anotada.
   */
  it("sin cantidad anotada, se entiende «tiene las que pedí»", () => {
    const r = repartir(fila([celda({ costoUsd: 7 })]));
    expect(r.tramos[0]?.cantidad).toBe(10);
    expect(r.falta).toBe(0);
  });

  it("entra un tercero cuando los dos primeros no llegan", () => {
    const r = repartir(
      fila([
        celda({ consulta_proveedor_id: "A", proveedor: "A", costoUsd: 9, cantidadDisponible: 2 }),
        celda({ consulta_proveedor_id: "B", proveedor: "B", costoUsd: 6, cantidadDisponible: 3 }),
        celda({ consulta_proveedor_id: "C", proveedor: "C", costoUsd: 7, cantidadDisponible: 4 }),
      ]),
    );
    expect(r.tramos.map((t) => t.proveedor)).toEqual(["B", "C", "A"]);
    expect(r.tramos.map((t) => t.cantidad)).toEqual([3, 4, 2]);
    expect(r.cubierto).toBe(9);
    expect(r.falta).toBe(1);
    // (3×6 + 4×7 + 2×9) / 9 = 64/9 = 7.1111
    expect(r.costoPonderado).toBe(7.1111);
  });

  /**
   * Es la parte que más fácil se hace mal: dividir entre lo que hacía falta
   * daría un unitario más barato de lo que nadie te vendió, y mejoraría cuanto
   * menos consigas.
   */
  it("el ponderado se calcula sobre lo cubierto, no sobre lo pedido", () => {
    const r = repartir(
      fila([celda({ consulta_proveedor_id: "A", proveedor: "A", costoUsd: 5, cantidadDisponible: 2 })]),
    );
    expect(r.cubierto).toBe(2);
    expect(r.falta).toBe(8);
    expect(r.costoPonderado).toBe(5);
  });

  it("un «no lo tiene» no entra en el reparto aunque sea el más barato", () => {
    const r = repartir(
      fila([
        celda({ consulta_proveedor_id: "A", proveedor: "A", costoUsd: 8 }),
        celda({ consulta_proveedor_id: "B", proveedor: "B", costoUsd: 1, disponible: false }),
      ]),
    );
    expect(r.tramos.map((t) => t.proveedor)).toEqual(["A"]);
    expect(r.costoPonderado).toBe(8);
  });

  it("sin ninguna oferta no hay reparto ni ponderado", () => {
    const r = repartir(fila([celda({ costoUsd: null, respondida: false, disponible: false })]));
    expect(r.tramos).toEqual([]);
    expect(r.cubierto).toBe(0);
    expect(r.falta).toBe(10);
    expect(r.costoPonderado).toBeNull();
  });
});

describe("comprasPropuestas con reparto", () => {
  const prov = (id: string, nombre: string) =>
    proveedor({ consulta_proveedor_id: id, proveedor_id: `p-${id}`, proveedor: nombre });

  const filas = (): FilaComparada[] => {
    const celdas = [
      celda({ consulta_proveedor_id: "A", proveedor: "A", costo: 8, costoUsd: 8 }),
      celda({
        consulta_proveedor_id: "B",
        proveedor: "B",
        costo: 6,
        costoUsd: 6,
        cantidadDisponible: 6,
      }),
    ];
    return [{ item: item({ cantidad: 10 }), celdas, ganador: ganadorDe(celdas), totalGanador: null }];
  };

  /**
   * El caso de Willy entero: no basta con enseñar el ponderado, hay que
   * COMPRARLO así. Si la propuesta siguiera pidiéndole 10 al que tiene 6, el
   * número de la pantalla sería decorativo y el pedido llegaría corto.
   */
  it("reparte el producto entre los dos proveedores", () => {
    const r = comprasPropuestas(filas(), [prov("A", "A"), prov("B", "B")], {
      i1: "B",
    });

    expect(r).toHaveLength(2);
    const b = r.find((c) => c.proveedor === "B");
    const a = r.find((c) => c.proveedor === "A");
    expect(b?.lineas[0]?.cantidad).toBe(6);
    expect(a?.lineas[0]?.cantidad).toBe(4);
    // 6 × 6 = 36 y 4 × 8 = 32.
    expect(b?.subtotal).toBe(36);
    expect(a?.subtotal).toBe(32);
  });

  /**
   * El reparto COMPLETA la elección, no la sustituye. Si alguien elige a A
   * —que tiene de sobra— se le compra todo a A aunque B esté más barato: hay
   * motivos que el sistema no sabe.
   */
  it("al elegido con stock de sobra se le compra todo", () => {
    const r = comprasPropuestas(filas(), [prov("A", "A"), prov("B", "B")], { i1: "A" });

    expect(r).toHaveLength(1);
    expect(r[0]?.proveedor).toBe("A");
    expect(r[0]?.lineas[0]?.cantidad).toBe(10);
  });

  /**
   * Y si al elegido no le alcanza, se completa con los demás en vez de dejar
   * el pedido corto. Es el caso de Willy visto desde la otra punta.
   */
  it("si al elegido no le alcanza, el resto lo completan los demás", () => {
    const r = comprasPropuestas(filas(), [prov("A", "A"), prov("B", "B")], { i1: "B" });

    expect(r.find((c) => c.proveedor === "B")?.lineas[0]?.cantidad).toBe(6);
    expect(r.find((c) => c.proveedor === "A")?.lineas[0]?.cantidad).toBe(4);
  });

  it("sin cantidades anotadas se comporta como siempre: todo al más barato", () => {
    const celdas = [
      celda({ consulta_proveedor_id: "A", proveedor: "A", costo: 8, costoUsd: 8 }),
      celda({ consulta_proveedor_id: "B", proveedor: "B", costo: 6, costoUsd: 6 }),
    ];
    const r = comprasPropuestas(
      [{ item: item({ cantidad: 10 }), celdas, ganador: ganadorDe(celdas), totalGanador: null }],
      [prov("A", "A"), prov("B", "B")],
      { i1: "B" },
    );

    expect(r).toHaveLength(1);
    expect(r[0]?.proveedor).toBe("B");
    expect(r[0]?.lineas[0]?.cantidad).toBe(10);
  });
});
