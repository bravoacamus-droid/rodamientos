import { describe, expect, it } from "vitest";

import {
  aPayload,
  avisos,
  bloqueos,
  costeoDe,
  estadoInicial,
  reducir,
  type EstadoRecepcion,
  type ProductoParaRecibir,
} from "./constructor";
import type { CompraPendiente } from "./tipos";

const FECHA = "2026-08-24";

const RODAMIENTO: ProductoParaRecibir = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "6205-2RS1/C3",
  descripcion: "Rodamiento rígido de bolas",
  marca: "SKF",
  unidad: "NIU",
  stock: 35,
  costo_promedio: 3.26,
};

const CHUMACERA: ProductoParaRecibir = {
  id: "22222222-2222-4222-8222-222222222222",
  codigo: "7210 BEP",
  descripcion: "Rodamiento de contacto angular",
  marca: "SKF",
  unidad: "NIU",
  stock: 8,
  costo_promedio: 34.43,
};

/** Aplica varias acciones en orden. */
function correr(
  inicial: EstadoRecepcion,
  ...acciones: Parameters<typeof reducir>[1][]
): EstadoRecepcion {
  return acciones.reduce(reducir, inicial);
}

describe("agregar líneas", () => {
  it("propone el costo promedio vigente, no cero", () => {
    // Arrancar en cero es lo que hace que un despiste meta mercadería a coste
    // nulo y hunda el promedio del producto.
    const e = reducir(estadoInicial(FECHA), { tipo: "agregar", producto: RODAMIENTO });

    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]?.costoUnitario).toBe(3.26);
    expect(e.lineas[0]?.costoAnterior).toBe(3.26);
    expect(e.lineas[0]?.cantidad).toBe(1);
  });

  it("suma a la línea existente en vez de duplicar el producto", () => {
    // No es cosmético: `recepcion_items` tiene UNIQUE (recepcion_id,
    // producto_id) y dos líneas del mismo código romperían el INSERT entero.
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO, cantidad: 10 },
      { tipo: "agregar", producto: RODAMIENTO, cantidad: 5 },
    );

    expect(e.lineas).toHaveLength(1);
    expect(e.lineas[0]?.cantidad).toBe(15);
  });

  it("da claves estables y deterministas", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "agregar", producto: CHUMACERA },
    );

    expect(e.lineas.map((l) => l.key)).toEqual(["r1", "r2"]);
  });

  it("rechaza una cantidad imposible y cae a 1", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "cantidad", key: "r1", valor: Number.NaN },
    );

    expect(e.lineas[0]?.cantidad).toBe(1);
  });

  it("admite costo cero pero no costo negativo", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "costo", key: "r1", valor: -5 },
    );

    expect(e.lineas[0]?.costoUnitario).toBe(0);
  });

  it("quita la línea indicada y deja las demás", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "agregar", producto: CHUMACERA },
      { tipo: "quitar", key: "r1" },
    );

    expect(e.lineas.map((l) => l.codigo)).toEqual(["7210 BEP"]);
  });
});

describe("recepción contra una compra", () => {
  const COMPRA: CompraPendiente = {
    id: "33333333-3333-4333-8333-333333333333",
    numero: "OC-000012",
    fecha: "2026-08-20",
    proveedor_id: "44444444-4444-4444-8444-444444444444",
    proveedor: "Importaciones del Norte S.A.C.",
    moneda: "USD",
    tipo_cambio: null,
    gastos_importacion: 25,
    lineas: [
      {
        producto_id: RODAMIENTO.id,
        codigo: RODAMIENTO.codigo,
        marca: "SKF",
        descripcion: RODAMIENTO.descripcion,
        unidad: "NIU",
        cantidad: 10,
        cantidad_recibida: 0,
        costo_unitario: 3.26,
      },
      {
        producto_id: CHUMACERA.id,
        codigo: CHUMACERA.codigo,
        marca: "SKF",
        descripcion: CHUMACERA.descripcion,
        unidad: "NIU",
        cantidad: 6,
        cantidad_recibida: 2,
        costo_unitario: 12.635,
      },
    ],
  };

  it("precarga solo lo que falta por llegar", () => {
    // Recibir en dos veces es lo normal. Volver a proponer lo ya recibido es
    // la forma más fácil de duplicar stock.
    const e = reducir(estadoInicial(FECHA), { tipo: "cargarCompra", compra: COMPRA });

    expect(e.lineas.map((l) => [l.codigo, l.cantidad])).toEqual([
      ["6205-2RS1/C3", 10],
      ["7210 BEP", 4],
    ]);
    expect(e.compraId).toBe(COMPRA.id);
    expect(e.proveedorId).toBe(COMPRA.proveedor_id);
    expect(e.gastosImportacion).toBe(25);
  });

  it("descarta las líneas ya recibidas del todo", () => {
    const completa: CompraPendiente = {
      ...COMPRA,
      lineas: COMPRA.lineas.map((l) => ({ ...l, cantidad_recibida: l.cantidad })),
    };
    const e = reducir(estadoInicial(FECHA), { tipo: "cargarCompra", compra: completa });

    expect(e.lineas).toHaveLength(0);
  });

  it("usa el costo pactado en la compra, no el promedio del maestro", () => {
    const e = reducir(estadoInicial(FECHA), { tipo: "cargarCompra", compra: COMPRA });

    expect(e.lineas[1]?.costoUnitario).toBe(12.635);
  });

  it("al soltar la compra conserva las líneas y suelta los gastos", () => {
    // El operador ya ha podido corregir cantidades; perderlas sería castigarle
    // por cambiar de opinión.
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "cargarCompra", compra: COMPRA },
      { tipo: "soltarCompra" },
    );

    expect(e.lineas).toHaveLength(2);
    expect(e.compraId).toBeNull();
    expect(e.gastosImportacion).toBe(0);
    expect(e.lineas.every((l) => l.pendiente === null)).toBe(true);
  });

  it("previsualiza el prorrateo de los gastos de la compra", () => {
    const e = reducir(estadoInicial(FECHA), { tipo: "cargarCompra", compra: COMPRA });
    const c = costeoDe(e);

    // 10 x 3.26 + 4 x 12.635 = 83.14, y 25 de gastos dan factor 1.300698.
    expect(c.base).toBe(83.14);
    expect(c.factor).toBe(1.300698);
    expect(c.totalFinal).toBe(108.14);
  });
});

describe("bloqueos", () => {
  it("explica todo lo que falta, no solo lo primero", () => {
    // Devuelve motivos y no un booleano: un botón deshabilitado sin
    // explicación es de las cosas que más se odian de un ERP.
    const b = bloqueos(estadoInicial(FECHA));

    expect(b.map((x) => x.campo).sort()).toEqual(["lineas", "proveedor"]);
  });

  it("exige proveedor aunque la base acepte NULL", () => {
    const e = reducir(estadoInicial(FECHA), { tipo: "agregar", producto: RODAMIENTO });

    expect(bloqueos(e).map((x) => x.campo)).toEqual(["proveedor"]);
  });

  it("no deja pasar una fecha con formato inválido", () => {
    const e = correr(
      estadoInicial("24/08/2026"),
      { tipo: "cabecera", campo: "proveedorId", valor: "44444444-4444-4444-8444-444444444444" },
      { tipo: "agregar", producto: RODAMIENTO },
    );

    expect(bloqueos(e).map((x) => x.campo)).toEqual(["fecha"]);
  });

  it("queda limpio con proveedor, fecha y al menos una línea", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "cabecera", campo: "proveedorId", valor: "44444444-4444-4444-8444-444444444444" },
      { tipo: "agregar", producto: RODAMIENTO, cantidad: 10 },
    );

    expect(bloqueos(e)).toEqual([]);
  });
});

describe("avisos", () => {
  it("señala la mercadería que entra a costo cero", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "costo", key: "r1", valor: 0 },
    );

    expect(avisos(e)).toHaveLength(1);
    expect(avisos(e)[0]?.mensaje).toContain("costo cero");
  });

  it("no encadena el aviso de variación sobre el de costo cero", () => {
    // Con costo cero la variación es del 100 %, pero decir las dos cosas de la
    // misma línea es ruido.
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: CHUMACERA },
      { tipo: "costo", key: "r1", valor: 0 },
    );

    expect(avisos(e)).toHaveLength(1);
  });

  it("señala un salto de costo que parece un decimal mal puesto", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "costo", key: "r1", valor: 32.6 },
    );

    expect(avisos(e)[0]?.mensaje).toContain("decimal");
  });

  it("calla ante una subida de precio normal", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "agregar", producto: RODAMIENTO },
      { tipo: "costo", key: "r1", valor: 3.6 },
    );

    expect(avisos(e)).toEqual([]);
  });

  it("avisa si llega más de lo que la compra esperaba, sin bloquear", () => {
    const compra: CompraPendiente = {
      id: "33333333-3333-4333-8333-333333333333",
      numero: "OC-000012",
      fecha: "2026-08-20",
      proveedor_id: "44444444-4444-4444-8444-444444444444",
      proveedor: "Importaciones del Norte S.A.C.",
      moneda: "USD",
      tipo_cambio: null,
      gastos_importacion: 0,
      lineas: [
        {
          producto_id: RODAMIENTO.id,
          codigo: RODAMIENTO.codigo,
          marca: "SKF",
          descripcion: RODAMIENTO.descripcion,
          unidad: "NIU",
          cantidad: 10,
          cantidad_recibida: 0,
          costo_unitario: 3.26,
        },
      ],
    };
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "cargarCompra", compra },
      { tipo: "cantidad", key: "c1", valor: 12 },
    );

    expect(bloqueos(e)).toEqual([]);
    expect(avisos(e)[0]?.mensaje).toContain("solo esperaba 10");
  });
});

describe("payload", () => {
  it("manda lo que espera recepcionar_mercaderia y nada más", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "cabecera", campo: "proveedorId", valor: "44444444-4444-4444-8444-444444444444" },
      { tipo: "cabecera", campo: "guiaProveedor", valor: "  001-000123  " },
      { tipo: "agregar", producto: RODAMIENTO, cantidad: 10 },
    );

    expect(aPayload(e)).toEqual({
      compra_id: null,
      proveedor_id: "44444444-4444-4444-8444-444444444444",
      fecha: FECHA,
      guia_proveedor: "001-000123",
      factura_proveedor: null,
      observaciones: null,
      items: [
        {
          producto_id: RODAMIENTO.id,
          cantidad: 10,
          costo_unitario: 3.26,
        },
      ],
    });
  });

  it("nunca manda los gastos: los relee la base de la compra", () => {
    // Aceptarlos de quien llama sería dejar que el navegador decidiera el
    // costo del inventario.
    const e = correr(estadoInicial(FECHA), { tipo: "agregar", producto: RODAMIENTO });
    const payload = aPayload(e) as Record<string, unknown>;

    expect(payload.gastos_importacion).toBeUndefined();
    expect(Object.keys(payload.items as object[]).length).toBe(1);
  });

  it("convierte los textos vacíos en null y no en cadena vacía", () => {
    const e = correr(
      estadoInicial(FECHA),
      { tipo: "cabecera", campo: "facturaProveedor", valor: "   " },
      { tipo: "agregar", producto: RODAMIENTO },
    );

    expect(aPayload(e).factura_proveedor).toBeNull();
  });
});

describe("datosDeAlmacen", () => {
  const compra: CompraPendiente = {
    id: "55555555-5555-4555-8555-555555555555",
    numero: "CMP-26-00008",
    proveedor_id: "66666666-6666-4666-8666-666666666666",
    proveedor: "Rodamientos Huánuco E.I.R.L.",
    fecha: "2026-09-03",
    moneda: "USD",
    tipo_cambio: null,
    gastos_importacion: 0,
    lineas: [
      {
        producto_id: RODAMIENTO.id,
        codigo: RODAMIENTO.codigo,
        marca: "SKF",
        descripcion: RODAMIENTO.descripcion,
        unidad: "NIU",
        cantidad: 5,
        cantidad_recibida: 0,
        costo_unitario: 6.78,
      },
    ],
  };

  it("la línea que viene de una compra entra SIN saldo ni costo anterior", () => {
    // Antes se ponía el costo de la propia compra como «anterior», así que la
    // etiqueta decía «antes 6.78» del costo 6.78 y la comprobación del decimal
    // comparaba el número consigo mismo.
    const e = reducir(estadoInicial("2026-09-03"), { tipo: "cargarCompra", compra });
    expect(e.lineas[0]?.stockAnterior).toBe(0);
    expect(e.lineas[0]?.costoAnterior).toBe(0);
  });

  it("y los rellena cuando el almacén contesta", () => {
    let e = reducir(estadoInicial("2026-09-03"), { tipo: "cargarCompra", compra });
    e = reducir(e, {
      tipo: "datosDeAlmacen",
      datos: { [RODAMIENTO.id]: { stock: 20, costoPromedio: 3.26 } },
    });
    // La pantalla decía «0 → 5» de un producto con veinte unidades.
    expect(e.lineas[0]?.stockAnterior).toBe(20);
    expect(e.lineas[0]?.costoAnterior).toBe(3.26);
  });

  it("un producto del que no llega nada se queda como estaba", () => {
    let e = reducir(estadoInicial("2026-09-03"), { tipo: "cargarCompra", compra });
    e = reducir(e, { tipo: "datosDeAlmacen", datos: {} });
    expect(e.lineas[0]?.stockAnterior).toBe(0);
  });
});
