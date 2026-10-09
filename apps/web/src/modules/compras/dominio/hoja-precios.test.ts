import { describe, expect, it } from "vitest";

import {
  aPayload,
  analizar,
  bloqueosAlGuardar,
  comprasDeLaHoja,
  hojaVacia,
  margenSobreCosto,
  reducir,
  type Hoja,
  type ProductoHoja,
  type ProveedorHoja,
} from "./hoja-precios";

const prod = (id: string, cantidad: number, precioVenta: number | null = null): ProductoHoja => ({
  productoId: id,
  codigo: id.toUpperCase(),
  descripcion: `Producto ${id}`,
  marca: null,
  unidad: "UND",
  cantidad,
  precioVenta,
  ultimoCosto: null,
});

const prov = (id: string, extra: Partial<ProveedorHoja> = {}): ProveedorHoja => ({
  proveedorId: id,
  nombre: `Proveedor ${id}`,
  tipo: "local",
  moneda: "USD",
  tipoCambio: null,
  incluyeIgv: false,
  ...extra,
});

/** Dos productos, dos proveedores: A más barato en x, B en y; B no tiene… nada raro. */
function hojaBase(): Hoja {
  let h = hojaVacia();
  h = reducir(h, { tipo: "productos", productos: [prod("x", 10, 20), prod("y", 4, 50)] });
  h = reducir(h, { tipo: "proveedor", proveedor: prov("a") });
  h = reducir(h, { tipo: "proveedor", proveedor: prov("b") });
  h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "x", precio: 10 });
  h = reducir(h, { tipo: "precio", proveedorId: "b", productoId: "x", precio: 12 });
  h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "y", precio: 40 });
  h = reducir(h, { tipo: "precio", proveedorId: "b", productoId: "y", precio: 30 });
  return h;
}

describe("la hoja: cambios", () => {
  it("añadir un producto que ya está suma la cantidad, no repite la fila", () => {
    let h = reducir(hojaVacia(), { tipo: "productos", productos: [prod("x", 2)] });
    h = reducir(h, { tipo: "productos", productos: [prod("x", 3)] });
    expect(h.productos).toHaveLength(1);
    expect(h.productos[0]!.cantidad).toBe(5);
  });

  it("«no tiene» borra el precio, y escribir un precio quita el «no tiene»", () => {
    let h = hojaBase();
    h = reducir(h, { tipo: "noTiene", proveedorId: "a", productoId: "x", noTiene: true });
    expect(h.casillas["a|x"]).toEqual({ precio: null, noTiene: true, tiene: null });
    h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "x", precio: 9 });
    expect(h.casillas["a|x"]).toMatchObject({ precio: 9, noTiene: false });
  });

  it("vaciar una casilla la quita: vacía es «todavía no se sabe»", () => {
    const h = reducir(hojaBase(), { tipo: "precio", proveedorId: "a", productoId: "x", precio: null });
    expect(h.casillas["a|x"]).toBeUndefined();
  });

  it("quitar un proveedor se lleva sus casillas y sus elecciones", () => {
    let h = reducir(hojaBase(), { tipo: "elegir", productoId: "x", proveedorId: "b" });
    h = reducir(h, { tipo: "quitarProveedor", proveedorId: "b" });
    expect(Object.keys(h.casillas).some((k) => k.startsWith("b|"))).toBe(false);
    expect(h.elegidos.x).toBeUndefined();
  });

  it("la cantidad es entera y nunca menor que uno", () => {
    let h = reducir(hojaBase(), { tipo: "cantidad", productoId: "x", cantidad: 2.6 });
    expect(h.productos[0]!.cantidad).toBe(3);
    h = reducir(h, { tipo: "cantidad", productoId: "x", cantidad: 0 });
    expect(h.productos[0]!.cantidad).toBe(1);
  });

  it("importar un análisis trae los productos, el proveedor y sus precios", () => {
    const h = reducir(hojaVacia(), {
      tipo: "importar",
      productos: [prod("x", 6), prod("y", 8)],
      proveedor: prov("z", { tipo: "importacion" }),
      precios: { x: 8.72, y: 4.27 },
    });
    expect(h.productos.map((p) => p.cantidad)).toEqual([6, 8]);
    expect(h.proveedores.map((p) => p.proveedorId)).toEqual(["z"]);
    expect(h.casillas["z|x"]!.precio).toBe(8.72);
  });
});

describe("la hoja: el análisis", () => {
  it("elige el más barato de cada producto y suma la compra repartida", () => {
    const a = analizar(hojaBase());
    expect(a.filas.x!.elegido!.proveedorId).toBe("a");
    expect(a.filas.y!.elegido!.proveedorId).toBe("b");
    // 10×10 + 4×30
    expect(a.total).toBe(220);
    expect(a.proveedoresElegidos).toBe(2);
  });

  it("compara contra comprarle todo a uno: el que tiene todo más barato", () => {
    const a = analizar(hojaBase());
    // A: 10×10 + 4×40 = 260 · B: 10×12 + 4×30 = 240 → B, y repartir ahorra 20.
    expect(a.todoAUno).toEqual({ proveedorId: "b", total: 240 });
    expect(a.ahorro).toBe(20);
  });

  it("el margen va sobre el costo (023)", () => {
    expect(margenSobreCosto(20, 10)).toBe(1);
    const a = analizar(hojaBase());
    expect(a.filas.x!.margen).toBe(1);
    // venta 10×20 + 4×50 = 400 sobre costo 220
    expect(a.margen).toBeCloseTo(400 / 220 - 1, 6);
  });

  it("elegir a mano a uno más caro se respeta y se marca", () => {
    const h = reducir(hojaBase(), { tipo: "elegir", productoId: "x", proveedorId: "b" });
    const a = analizar(h);
    expect(a.filas.x!.elegido!.proveedorId).toBe("b");
    expect(a.filas.x!.elegidoAMano).toBe(true);
    expect(a.total).toBe(240);
  });

  it("«no tiene» no compite, y sin todo no hay «todo a uno»", () => {
    const h = reducir(hojaBase(), { tipo: "noTiene", proveedorId: "b", productoId: "x", noTiene: true });
    const a = analizar(h);
    expect(a.filas.x!.ofertas.map((o) => o.proveedorId)).toEqual(["a"]);
    expect(a.columnas.b!.tieneTodo).toBe(false);
    expect(a.todoAUno?.proveedorId).toBe("a");
  });

  it("los soles se pasan a dólares, y el IGV se quita, antes de comparar", () => {
    let h = hojaVacia();
    h = reducir(h, { tipo: "productos", productos: [prod("x", 1)] });
    h = reducir(h, { tipo: "proveedor", proveedor: prov("a") });
    h = reducir(h, { tipo: "proveedor", proveedor: prov("s", { moneda: "PEN", tipoCambio: 3.5, incluyeIgv: true }) });
    h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "x", precio: 10 });
    // 41.30 soles con IGV = 35 sin IGV = 10 dólares exactos; 40 soles con IGV gana.
    h = reducir(h, { tipo: "precio", proveedorId: "s", productoId: "x", precio: 40 });
    const a = analizar(h);
    expect(a.filas.x!.elegido!.proveedorId).toBe("s");
  });

  it("soles sin tipo de cambio no se comparan, y no dejan guardar", () => {
    let h = hojaVacia();
    h = reducir(h, { tipo: "productos", productos: [prod("x", 1)] });
    h = reducir(h, { tipo: "proveedor", proveedor: prov("s", { moneda: "PEN", tipoCambio: null }) });
    h = reducir(h, { tipo: "precio", proveedorId: "s", productoId: "x", precio: 40 });
    expect(analizar(h).filas.x!.elegido).toBeNull();
    expect(bloqueosAlGuardar(h)[0]).toMatch(/tipo de cambio/);
  });

  it("si el elegido no tiene todas, se dice cuántas faltan", () => {
    const h = reducir(hojaBase(), { tipo: "tiene", proveedorId: "a", productoId: "x", tiene: 6 });
    const a = analizar(h);
    expect(a.filas.x!.faltan).toBe(4);
    expect(a.columnas.a!.tieneTodo).toBe(false);
  });
});

describe("la hoja: cuánto se gana", () => {
  it("por unidad y en total, contra el P.V.", () => {
    const a = analizar(hojaBase());
    // x: vende 20, compra 10 → 10 por unidad, 10 unidades
    expect(a.filas.x!.gananciaUnidad).toBe(10);
    expect(a.filas.x!.gananciaTotal).toBe(100);
    // 400 de venta − 220 de costo
    expect(a.ganancia).toBe(180);
  });

  it("sin P.V., se mide contra la última venta", () => {
    let h = hojaVacia();
    h = reducir(h, {
      tipo: "productos",
      productos: [{ ...prod("x", 2), ultimaVenta: { precio: 15, fecha: "2026-09-01", cliente: "C" } }],
    });
    h = reducir(h, { tipo: "proveedor", proveedor: prov("a") });
    h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "x", precio: 10 });
    const a = analizar(h);
    expect(a.filas.x!.margen).toBeCloseTo(0.5, 6);
    expect(a.filas.x!.gananciaTotal).toBe(10);
  });

  it("dice si sale más caro que la última compra", () => {
    let h = hojaVacia();
    h = reducir(h, {
      tipo: "productos",
      productos: [{ ...prod("x", 1, 20), ultimaCompra: { costoUsd: 8, fecha: "2026-09-01", proveedor: "P" } }],
    });
    h = reducir(h, { tipo: "proveedor", proveedor: prov("a") });
    h = reducir(h, { tipo: "precio", proveedorId: "a", productoId: "x", precio: 10 });
    expect(analizar(h).filas.x!.contraUltimaCompra).toBeCloseTo(0.25, 6);
  });
});

describe("la hoja: lo que sale", () => {
  it("una compra por proveedor, en su moneda y sin IGV", () => {
    let h = hojaBase();
    h = reducir(h, { tipo: "igv", proveedorId: "b", incluyeIgv: true });
    h = reducir(h, { tipo: "precio", proveedorId: "b", productoId: "y", precio: 23.6 });
    const compras = comprasDeLaHoja(h);
    expect(compras.map((c) => c.proveedorId).sort()).toEqual(["a", "b"]);
    const b = compras.find((c) => c.proveedorId === "b")!;
    expect(b.lineas).toEqual([{ productoId: "y", codigo: "Y", cantidad: 4, costoUnitario: 20 }]);
    expect(b.subtotal).toBe(80);
  });

  it("el payload lleva solo las casillas con algo, y el «no tiene» sin precio", () => {
    const h = reducir(hojaBase(), { tipo: "noTiene", proveedorId: "b", productoId: "x", noTiene: true });
    const p = aPayload(h);
    const b = p.proveedores.find((x) => x.proveedor_id === "b")!;
    expect(b.precios).toContainEqual({ producto_id: "x", costo_unitario: null, disponible: false, cantidad_disponible: null });
    expect(p.items).toEqual([
      { producto_id: "x", cantidad: 10 },
      { producto_id: "y", cantidad: 4 },
    ]);
  });
});
