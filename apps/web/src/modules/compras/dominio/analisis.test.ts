import { describe, expect, it } from "vitest";

import {
  aPayload,
  bloqueos,
  calcular,
  estadoInicial,
  reducir,
  type Accion,
  type EstadoAnalisis,
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
