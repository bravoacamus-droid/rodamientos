import { describe, expect, it } from "vitest";

import {
  aPayload,
  bloqueos,
  calcular,
  estadoInicial,
  porKgDeLaHoja,
  reducir,
  type Accion,
  type EstadoAnalisis,
  type LineaAnalisis,
} from "./analisis";

const correr = (...acciones: Accion[]): EstadoAnalisis =>
  acciones.reduce(reducir, estadoInicial("2026-10-02"));

/*
  Su hoja real (01/10), con dos de sus filas:
    6312 2Z/C3   cotiza 12, pide 6,  FOB 9.432,  1.73 kg,  P.M 40.91
    HK 1012      cotiza 20, pide 20, FOB 0.393,  0.00454 kg, P.M 2.063
  y un envío elegido para que el $/kg dé su 10.15.
*/
function suHoja(): EstadoAnalisis {
  let e = correr(
    { tipo: "agregarLibre", codigo: "6312 2z/c3", marca: "skf" },
    { tipo: "agregarLibre", codigo: "HK 1012", marca: "INA" },
  );
  const [a, b] = e.lineas.map((l) => l.key) as [string, string];
  const set = (key: string, campo: Extract<Accion, { tipo: "campo" }>["campo"], valor: number) => {
    e = reducir(e, { tipo: "campo", key, campo, valor });
  };
  set(a, "cantidadRef", 12);
  set(a, "precioFob", 9.432);
  set(a, "pesoKg", 1.73);
  set(a, "precioMercado", 40.91);
  set(a, "cantidadPedido", 6);
  set(b, "cantidadRef", 20);
  set(b, "precioFob", 0.393);
  set(b, "pesoKg", 0.00454);
  set(b, "precioMercado", 2.063);
  const peso = 12 * 1.73 + 20 * 0.00454;
  return reducir(e, { tipo: "cabecera", campo: "costoEnvio", valor: 10.15 * peso });
}

describe("el cálculo de su hoja", () => {
  it("$/kg = envío ÷ peso cotizado", () => {
    const c = calcular(suHoja());
    expect(c.pesoRef).toBeCloseTo(20.8508, 3);
    expect(c.porKg).toBeCloseTo(10.15, 2);
  });

  it("PU Lima = FOB + peso × $/kg, como su columna", () => {
    const e = suHoja();
    const c = calcular(e);
    const [a, b] = e.lineas;
    // Su M10 era 26.9915 y su M7, 0.439081.
    expect(c.lineas[a!.key]!.puLima).toBeCloseTo(26.9915, 2);
    expect(c.lineas[b!.key]!.puLima).toBeCloseTo(0.4391, 3);
  });

  it("su columna «%» es mercado ÷ Lima, y el margen va sobre el costo", () => {
    const e = suHoja();
    const c = calcular(e);
    const a = c.lineas[e.lineas[0]!.key]!;
    // Su R10: 1.5157.
    expect(a.rinde).toBeCloseTo(1.5157, 3);
    expect(a.margen).toBeCloseTo(0.5157, 3);
  });

  it("lo pedido recalcula valor, peso y envío con el mismo $/kg", () => {
    const c = calcular(suHoja());
    expect(c.fobPedido).toBeCloseTo(6 * 9.432 + 20 * 0.393, 2);
    expect(c.pesoPedido).toBeCloseTo(6 * 1.73 + 20 * 0.00454, 4);
    expect(c.envioPedido).toBeCloseTo(c.pesoPedido * 10.15, 1);
  });

  it("el peso que dice el proveedor se compara", () => {
    const e = reducir(suHoja(), { tipo: "cabecera", campo: "pesoDeclarado", valor: 22 });
    expect(calcular(e).difPeso).toBeCloseTo(20.8508 - 22, 3);
  });

  it("sin precio de mercado no hay margen, y no ensucia el del pedido", () => {
    let e = suHoja();
    e = reducir(e, { tipo: "campo", key: e.lineas[1]!.key, campo: "precioMercado", valor: 0 });
    const c = calcular(e);
    expect(c.lineas[e.lineas[1]!.key]!.margen).toBeNull();
    expect(c.sinMercado).toEqual([e.lineas[1]!.key]);
    expect(c.rinde).toBeCloseTo(1.5157, 3);
  });

  it("sin envío o sin peso, el $/kg es cero y no divide por cero", () => {
    const e = correr({ tipo: "agregarLibre", codigo: "X", marca: "" });
    expect(calcular(e).porKg).toBe(0);
    expect(calcular(e).sinPeso).toHaveLength(1);
  });
});

describe("la cantidad final", () => {
  it("sigue a la cotizada mientras nadie la toque", () => {
    let e = correr({ tipo: "agregarLibre", codigo: "X", marca: "" });
    const k = e.lineas[0]!.key;
    e = reducir(e, { tipo: "campo", key: k, campo: "cantidadRef", valor: 10 });
    expect(e.lineas[0]!.cantidadPedido).toBe(10);
    e = reducir(e, { tipo: "campo", key: k, campo: "cantidadPedido", valor: 4 });
    e = reducir(e, { tipo: "campo", key: k, campo: "cantidadRef", valor: 12 });
    expect(e.lineas[0]!.cantidadPedido).toBe(4);
  });

  it("«pedir lo cotizado» las iguala todas", () => {
    let e = suHoja();
    e = reducir(e, { tipo: "pedirLoCotizado" });
    expect(e.lineas.map((l) => l.cantidadPedido)).toEqual([12, 20]);
  });
});

describe("del catálogo y propuestas", () => {
  const P = { id: "p1", codigo: "6312-2Z/C3", descripcion: "Rodamiento", marca: "SKF", peso_kg: 1.73, precio_mercado: 40.91 };

  it("trae peso y precio de mercado del catálogo", () => {
    const e = correr({ tipo: "agregar", producto: P });
    expect(e.lineas[0]).toMatchObject({ productoId: "p1", pesoKg: 1.73, precioMercado: 40.91 });
  });

  it("el mismo producto dos veces suma, no duplica", () => {
    const e = correr({ tipo: "agregar", producto: P }, { tipo: "agregar", producto: P });
    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]!.cantidadRef).toBe(2);
  });

  it("la «f» y el último FOB se proponen solo donde no hay nada escrito", () => {
    let e = correr({ tipo: "agregar", producto: P });
    e = reducir(e, {
      tipo: "propuestas",
      frecuencias: { p1: 4 },
      fobs: { p1: { precio: 9.43, numero: "ANA-26-00001" } },
    });
    expect(e.lineas[0]).toMatchObject({ frecuencia: 4, precioFob: 9.43 });

    e = reducir(e, { tipo: "campo", key: e.lineas[0]!.key, campo: "precioFob", valor: 8 });
    e = reducir(e, {
      tipo: "propuestas",
      frecuencias: { p1: 9 },
      fobs: { p1: { precio: 9.43, numero: "ANA-26-00001" } },
    });
    expect(e.lineas[0]).toMatchObject({ frecuencia: 4, precioFob: 8 });
  });
});

describe("guardar", () => {
  it("pide proveedor y productos", () => {
    expect(bloqueos(estadoInicial("2026-10-02"))).toHaveLength(2);
  });

  it("el payload lleva lo libre con producto null", () => {
    const p = aPayload(suHoja());
    expect(p.items[0]).toMatchObject({ producto_id: null, codigo: "6312 2Z/C3", marca: "SKF" });
  });
});

describe("el $/kg de su hoja (100)", () => {
  it("se CORTA a dos decimales, no se redondea: 10.1559 → 10.15", () => {
    expect(porKgDeLaHoja(1039 / 102.3054)).toBe(10.15);
    expect(porKgDeLaHoja(10.159999)).toBe(10.15);
    expect(porKgDeLaHoja(10.2)).toBe(10.2);
    expect(porKgDeLaHoja(0)).toBe(0);
  });

  it("el PU Lima usa el cortado, y enseña también el exacto", () => {
    const e = correr(
      { tipo: "cargarHoja", costoEnvio: 1000, lineas: [linea({ codigo: "A", cantidadRef: 3, precioFob: 2, pesoKg: 33 })] },
    );
    const c = calcular(e);
    // 1000 ÷ 99 = 10.1010… → 10.10
    expect(c.porKgExacto).toBeCloseTo(10.101, 3);
    expect(c.porKg).toBe(10.1);
    expect(c.lineas[e.lineas[0]!.key]!.puLima).toBeCloseTo(2 + 33 * 10.1, 6);
  });

  it("el bloque de abajo: W. REAL es el peso más un 10 %, y el envío del pedido va al $/kg cortado", () => {
    const e = correr({
      tipo: "cargarHoja",
      costoEnvio: 500,
      lineas: [
        linea({ codigo: "A", cantidadRef: 10, cantidadPedido: 4, precioFob: 1.5, pesoKg: 2, precioMercado: 60 }),
        linea({ codigo: "B", cantidadRef: 5, cantidadPedido: 5, precioFob: 3, pesoKg: 6 }),
      ],
    });
    const c = calcular(e);
    expect(c.pesoRef).toBe(50);
    expect(c.pesoRealRef).toBe(55);
    expect(c.porKg).toBe(10);
    expect(c.cantidadRef).toBe(15);
    expect(c.cantidadPedido).toBe(9);
    expect(c.pesoPedido).toBe(38);
    expect(c.envioPedido).toBe(380);
    // El total en Lima es FOB + envío, sin un céntimo de diferencia.
    expect(c.totalLima).toBeCloseTo(c.fobPedido + c.envioPedido, 6);
  });
});

describe("cargar su hoja", () => {
  it("reemplaza las líneas, guarda el cliente y pone el DHL", () => {
    const e = correr(
      { tipo: "agregarLibre", codigo: "VIEJO", marca: "" },
      {
        tipo: "cargarHoja",
        costoEnvio: 1039,
        lineas: [linea({ codigo: "NUEVO", cliente: "ACME" })],
      },
    );
    expect(e.lineas.map((l) => l.codigo)).toEqual(["NUEVO"]);
    expect(e.lineas[0]!.cliente).toBe("ACME");
    expect(e.costoEnvio).toBe(1039);
    expect(aPayload(e).items[0]!.cliente).toBe("ACME");
  });

  it("sin DHL en la hoja, se queda el que estaba escrito", () => {
    const e = correr(
      { tipo: "cabecera", campo: "costoEnvio", valor: 800 },
      { tipo: "cargarHoja", costoEnvio: null, lineas: [linea({ codigo: "X" })] },
    );
    expect(e.costoEnvio).toBe(800);
  });

  it("las claves no se repiten aunque se cargue dos veces", () => {
    const una: Accion = { tipo: "cargarHoja", costoEnvio: null, lineas: [linea({ codigo: "X" }), linea({ codigo: "Y" })] };
    const e = correr(una, una);
    expect(new Set(e.lineas.map((l) => l.key)).size).toBe(2);
    expect(e.proximaKey).toBeGreaterThan(2);
  });
});

function linea(p: Partial<Omit<LineaAnalisis, "key" | "fobAnterior">>): Omit<LineaAnalisis, "key" | "fobAnterior"> {
  return {
    productoId: null,
    codigo: "",
    marca: "",
    descripcion: "",
    cantidadRef: 1,
    cantidadPedido: 1,
    precioFob: 0,
    pesoKg: 0,
    precioMercado: 0,
    proveedorMercado: "",
    frecuencia: null,
    cliente: "",
    ...p,
  };
}

describe("rellenarlo a mano, como su hoja", () => {
  const PRODUCTO = { id: "p1", codigo: "6313-2Z/C3", descripcion: "Rodamiento", marca: "SKF", peso_kg: 2.13, precio_mercado: 53.95 };

  it("una fila nueva sale vacía y con cantidades en 0", () => {
    const e = correr({ tipo: "agregarFila" });
    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]).toMatchObject({ codigo: "", cantidadRef: 0, cantidadPedido: 0, productoId: null });
  });

  it("al escribir lo cotizado, el pedido lo sigue", () => {
    let e = correr({ tipo: "agregarFila" });
    e = reducir(e, { tipo: "campo", key: e.lineas[0]!.key, campo: "cantidadRef", valor: 6 });
    expect(e.lineas[0]!.cantidadPedido).toBe(6);
  });

  it("el catálogo enlaza el código y llena solo lo vacío", () => {
    let e = correr({ tipo: "agregarFila" });
    const key = e.lineas[0]!.key;
    e = reducir(e, { tipo: "texto", key, campo: "codigo", valor: "6313 2z/c3" });
    e = reducir(e, { tipo: "campo", key, campo: "pesoKg", valor: 2.2 });
    e = reducir(e, { tipo: "enlazar", key, producto: PRODUCTO });
    expect(e.lineas[0]).toMatchObject({ productoId: "p1", codigo: "6313-2Z/C3", marca: "SKF", pesoKg: 2.2, precioMercado: 53.95 });
  });

  it("cambiar el código suelta el producto; repetirlo igual, no", () => {
    let e = correr({ tipo: "agregarFila" });
    const key = e.lineas[0]!.key;
    e = reducir(e, { tipo: "enlazar", key, producto: PRODUCTO });
    e = reducir(e, { tipo: "texto", key, campo: "codigo", valor: "6313-2z/c3" });
    expect(e.lineas[0]!.productoId).toBe("p1");
    e = reducir(e, { tipo: "texto", key, campo: "codigo", valor: "6314" });
    expect(e.lineas[0]).toMatchObject({ productoId: null, codigo: "6314", descripcion: "" });
  });

  it("las filas vacías ni bloquean, ni se guardan, ni piden peso", () => {
    let e = correr({ tipo: "cabecera", campo: "proveedorId", valor: "prov" }, { tipo: "agregarFila" }, { tipo: "agregarFila" });
    expect(bloqueos(e)).toEqual(["Escribe los productos de la proforma."]);
    e = reducir(e, { tipo: "texto", key: e.lineas[0]!.key, campo: "codigo", valor: "A1" });
    expect(bloqueos(e)).toEqual([]);
    expect(aPayload(e).items).toHaveLength(1);
    expect(calcular(e).sinPeso).toEqual([e.lineas[0]!.key]);
  });
});

describe("el buscador y las filas vacías", () => {
  it("el producto elegido cae en la fila vacía, no debajo", () => {
    const e = correr(
      { tipo: "agregarLibre", codigo: "A1", marca: "" },
      { tipo: "agregarFila" },
      { tipo: "agregar", producto: { id: "p9", codigo: "6205", descripcion: "Rod.", marca: "SKF" } },
    );
    expect(e.lineas.map((l) => l.codigo)).toEqual(["A1", "6205"]);
    expect(e.lineas[1]!.cantidadRef).toBe(1);
  });
});

describe("el desaduanaje, dentro del $/kg (Willy, 02/10)", () => {
  /*
    Willy, 02/10: «DHL + desaduanaje ÷ peso total, cortado a 2 decimales […]
    después ya se divide por el peso».

    FOB 10 × 10 uds, 1 kg cada una → 10 kg. DHL 50. Mercado 45.
  */
  const base = () =>
    correr({
      tipo: "cargarHoja",
      costoEnvio: 50,
      lineas: [linea({ codigo: "A", cantidadRef: 10, cantidadPedido: 10, precioFob: 10, pesoKg: 1, precioMercado: 45 })],
    });
  const conDesaduanaje = (soles: number, tc: number) =>
    reducir(
      reducir(base(), { tipo: "cabecera", campo: "desaduanajeSoles", valor: soles }),
      { tipo: "cabecera", campo: "tipoCambio", valor: tc },
    );

  it("sin desaduanaje, el $/kg y el PU son los de su hoja", () => {
    const c = calcular(base());
    expect(c.porKg).toBe(5);
    expect(c.lineas[base().lineas[0]!.key]!.puLima).toBe(15);
    expect(c.costoTotal).toBe(150);
    expect(c.rinde).toBeCloseTo(3, 6);
  });

  it("(DHL + desaduanaje en $) ÷ peso, y el PU LIMA = FOB + peso × ese $/kg", () => {
    const e = conDesaduanaje(750, 3.75); // $200
    const c = calcular(e);
    expect(c.desaduanaje).toBe(200);
    expect(c.porKgExacto).toBe(25); // (50 + 200) ÷ 10
    expect(c.porKg).toBe(25);
    expect(c.lineas[e.lineas[0]!.key]!.puLima).toBe(35); // 10 + 1 × 25
    expect(c.costoTotal).toBe(350);
    expect(c.costoTotalRef).toBe(350);
    expect(c.rinde).toBeCloseTo(450 / 350, 6);
    expect(aPayload(e)).toMatchObject({ desaduanaje_soles: 750, tipo_cambio: 3.75 });
  });

  it("se corta a dos decimales DESPUÉS de sumar, como su 10.15", () => {
    // (50 + 750/3.454) ÷ 10 = (50 + 217.1395…) ÷ 10 = 26.7139… → 26.71
    const c = calcular(conDesaduanaje(750, 3.454));
    expect(c.porKgExacto).toBeCloseTo(26.7139, 3);
    expect(c.porKg).toBe(26.71);
  });

  it("el DHL y el desaduanaje del pedido suman justo lo que reparte el $/kg", () => {
    const e = reducir(conDesaduanaje(750, 3.75), {
      tipo: "campo",
      key: base().lineas[0]!.key,
      campo: "cantidadPedido",
      valor: 4,
    });
    const c = calcular(e);
    // 4 kg × 25 = 100: 20 de DHL y 80 de desaduanaje (50 : 200).
    expect(c.envioPedido).toBe(100);
    expect(c.dhlPedido).toBe(20);
    expect(c.desaduanajePedido).toBe(80);
    expect(c.costoTotal).toBe(140); // 40 + 100
    expect(c.rinde).toBeCloseTo(180 / 140, 6);
  });

  it("sin desaduanaje, el DHL del pedido es el de su hoja (peso × $/kg)", () => {
    const e = reducir(base(), { tipo: "campo", key: base().lineas[0]!.key, campo: "cantidadPedido", valor: 4 });
    const c = calcular(e);
    expect(c.dhlPedido).toBe(20);
    expect(c.desaduanajePedido).toBe(0);
  });

  it("con soles y sin tipo de cambio no suma nada, y lo avisa", () => {
    const c = calcular(reducir(base(), { tipo: "cabecera", campo: "desaduanajeSoles", valor: 750 }));
    expect(c.desaduanaje).toBe(0);
    expect(c.porKg).toBe(5);
    expect(c.faltaTipoCambio).toBe(true);
  });
});
