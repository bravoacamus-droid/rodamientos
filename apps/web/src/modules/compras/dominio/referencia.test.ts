import { describe, expect, it } from "vitest";

import {
  alertaDePrecio,
  contraReferencia,
  faltaPreguntarle,
  margenSi,
  mejorConocido,
  porcentajeQueDiceAlgo,
  referenciaVacia,
  tieneAlgoQueDecir,
  type ProveedorConocido,
  type Referencia,
} from "./referencia";

const prov = (
  id: string,
  nombre: string,
  costo: number | null,
  extra: Partial<ProveedorConocido> = {},
): ProveedorConocido => ({
  proveedor_id: id,
  proveedor: nombre,
  ultimoCostoUsd: costo,
  ultimaCompra: costo === null ? null : "2026-08-12",
  activo: true,
  esHabitual: false,
  ...extra,
});

/** El 6205 con historia: dos que se lo han vendido y una ronda anterior. */
const REF: Referencia = {
  producto_id: "p-6205",
  ultimoCosto: 8.2,
  costoPromedio: 8.65,
  precioVenta: 12.4,
  precioMinimo: 10,
  proveedores: [prov("v1", "CORPUS", 8.2), prov("v2", "GALLEGOS", 9.1)],
  historial: [
    { fecha: "2026-07-30", proveedor: "IDIVSA", costoUsd: 7.95 },
    { fecha: "2026-06-02", proveedor: "CORPUS", costoUsd: 8.4 },
  ],
};

describe("mejorConocido", () => {
  it("se queda con el más barato de todo, comprado o cotizado", () => {
    const m = mejorConocido(REF);
    expect(m).not.toBeNull();
    expect(m!.costoUsd).toBe(7.95);
    expect(m!.proveedor).toBe("IDIVSA");
    expect(m!.origen).toBe("cotizado");
  });

  it("no es el más reciente, es el más barato", () => {
    // La cotización de julio es más barata que la compra de agosto, y gana
    // aunque sea más vieja: la pregunta es «¿es el mejor que he tenido?».
    const m = mejorConocido(REF)!;
    expect(m.fecha).toBe("2026-07-30");
  });

  it("en empate gana lo comprado, que es una factura y no una promesa", () => {
    const r: Referencia = {
      ...REF,
      proveedores: [prov("v1", "CORPUS", 8)],
      historial: [{ fecha: "2026-07-30", proveedor: "IDIVSA", costoUsd: 8 }],
    };
    expect(mejorConocido(r)!.origen).toBe("comprado");
    expect(mejorConocido(r)!.proveedor).toBe("CORPUS");
  });

  it("sin nada que comparar devuelve null y no cero", () => {
    expect(mejorConocido(referenciaVacia("p-1"))).toBeNull();
  });

  it("ignora los ceros: un costo cero es «no consta», no «gratis»", () => {
    const r: Referencia = {
      ...referenciaVacia("p-1"),
      proveedores: [prov("v1", "CORPUS", 0)],
    };
    expect(mejorConocido(r)).toBeNull();
  });
});

describe("contraReferencia", () => {
  it("dice cuánto más caro te lo están dejando", () => {
    const c = contraReferencia(9.5, REF)!;
    expect(c.veredicto).toBe("peor");
    expect(c.diferencia).toBeCloseTo(1.55, 4);
    expect(c.porcentaje).toBeCloseTo(19.5, 1);
  });

  it("y cuánto más barato", () => {
    const c = contraReferencia(7, REF)!;
    expect(c.veredicto).toBe("mejor");
    expect(c.diferencia).toBeCloseTo(-0.95, 4);
  });

  it("medio céntimo de diferencia es «igual», no «más caro»", () => {
    const c = contraReferencia(7.9501, REF)!;
    expect(c.veredicto).toBe("igual");
  });

  it("sin referencia no inventa un veredicto", () => {
    expect(contraReferencia(9.5, referenciaVacia("p-1"))).toBeNull();
  });

  it("sin precio escrito todavía, tampoco", () => {
    expect(contraReferencia(null, REF)).toBeNull();
    expect(contraReferencia(0, REF)).toBeNull();
  });
});

describe("porcentajeQueDiceAlgo", () => {
  it("deja pasar los que se entienden", () => {
    expect(porcentajeQueDiceAlgo(19.5)).toBe(19.5);
    expect(porcentajeQueDiceAlgo(-12)).toBe(-12);
    expect(porcentajeQueDiceAlgo(999)).toBe(999);
  });

  it("se calla los absurdos: «17400% más caro» no informa de nada", () => {
    // Salió en pantalla comparando $35.00 contra una referencia de $0.20.
    expect(porcentajeQueDiceAlgo(17400)).toBeNull();
    expect(porcentajeQueDiceAlgo(-1000)).toBeNull();
  });
});

describe("margenSi", () => {
  it("va sobre el COSTO, como el resto del ERP desde la 023", () => {
    // Costo 10, venta 12 → 20 %, no 16,7 %.
    expect(margenSi(10, 12)).toBe(20);
  });

  it("puede ser negativo: eso es exactamente lo que hay que ver", () => {
    expect(margenSi(15, 12)).toBe(-20);
  });

  it("sin precio de venta cargado no se inventa un margen", () => {
    // Es el caso de los 790 productos del catálogo, que entraron sin precios.
    expect(margenSi(10, 0)).toBeNull();
    expect(margenSi(10, null)).toBeNull();
  });
});

describe("alertaDePrecio", () => {
  it("avisa cuando te lo dejan a más de lo que lo vendes", () => {
    expect(alertaDePrecio(13, REF)).toBe("sobre_venta");
  });

  it("avisa cuando cabe en la lista pero no en el piso", () => {
    // 11 < 12.40 de venta, pero >= 10 de piso: bajando al P.M. se pierde.
    expect(alertaDePrecio(11, REF)).toBe("sobre_piso");
  });

  it("no dice nada cuando el precio está bien", () => {
    expect(alertaDePrecio(8, REF)).toBeNull();
  });

  it("un precio igual a la venta ya es perder, no empatar", () => {
    expect(alertaDePrecio(12.4, REF)).toBe("sobre_venta");
  });

  it("un P.V. o un P.M. en 0 es «sin definir», no «gratis»", () => {
    // Con 790 productos sin precios cargados, tratarlo como cero pintaría de
    // rojo el catálogo entero.
    const sinPrecios: Referencia = { ...REF, precioVenta: 0, precioMinimo: 0 };
    expect(alertaDePrecio(99, sinPrecios)).toBeNull();
  });
});

describe("faltaPreguntarle", () => {
  it("saca a los que ya están en la ronda", () => {
    const r = faltaPreguntarle(REF, new Set(["v1"]));
    expect(r.map((p) => p.proveedor_id)).toEqual(["v2"]);
  });

  it("no recuerda a los de baja: no se les puede comprar", () => {
    const r: Referencia = {
      ...REF,
      proveedores: [prov("v3", "DE BAJA", 5, { activo: false })],
    };
    expect(faltaPreguntarle(r, new Set())).toEqual([]);
  });

  it("del más barato al más caro, y los que nunca cobraron al final", () => {
    const r: Referencia = {
      ...REF,
      proveedores: [
        prov("v2", "GALLEGOS", 9.1),
        prov("v9", "NUEVO", null),
        prov("v1", "CORPUS", 8.2),
      ],
    };
    expect(faltaPreguntarle(r, new Set()).map((p) => p.proveedor)).toEqual([
      "CORPUS",
      "GALLEGOS",
      "NUEVO",
    ]);
  });

  it("con todos preguntados no queda nadie", () => {
    expect(faltaPreguntarle(REF, new Set(["v1", "v2"]))).toEqual([]);
  });
});

describe("tieneAlgoQueDecir", () => {
  it("una referencia vacía no se pinta", () => {
    expect(tieneAlgoQueDecir(referenciaVacia("p-1"))).toBe(false);
  });

  it("con un solo dato ya vale la pena", () => {
    expect(
      tieneAlgoQueDecir({ ...referenciaVacia("p-1"), precioVenta: 12.4 }),
    ).toBe(true);
  });

  it("los ceros del maestro no cuentan como dato", () => {
    expect(
      tieneAlgoQueDecir({
        ...referenciaVacia("p-1"),
        ultimoCosto: 0,
        costoPromedio: 0,
        precioVenta: 0,
        precioMinimo: 0,
        proveedores: [prov("v1", "CORPUS", 0)],
      }),
    ).toBe(false);
  });
});
