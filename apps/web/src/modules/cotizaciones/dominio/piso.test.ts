import { describe, expect, it } from "vitest";

import {
  descuentoMaximoPct,
  lineasBajoPiso,
  precioNeto,
  revisarPiso,
  valorUnitarioMinimo,
} from "./piso";

/**
 * Los números salen del archivo real del cliente:
 *
 *   6205-2RS1/C3  SKF   P.C. 3.26   P.V. 3.92   P.M. 3.86
 *   6209-2RS1/C3  SKF   P.C. 10.70  P.V. 12.84  P.M. 11.96
 *   7210 BEP      SKF   P.C. 34.43  P.V. 41.32  P.M. 38.76
 */

describe("precioNeto", () => {
  it("sin descuento devuelve el valor unitario", () => {
    expect(precioNeto({ cantidad: 1, valorUnitario: 3.92 })).toBe(3.92);
  });

  it("aplica el descuento", () => {
    expect(
      precioNeto({ cantidad: 1, valorUnitario: 12.84, descuentoPct: 10 }),
    ).toBe(11.556);
  });

  it("redondea a 4 decimales, como la columna generada de la base", () => {
    // 41.32 * (1 - 7.77/100) = 38.109436  ->  38.1094
    expect(
      precioNeto({ cantidad: 1, valorUnitario: 41.32, descuentoPct: 7.77 }),
    ).toBe(38.1094);
  });
});

describe("descuentoMaximoPct", () => {
  it("devuelve null cuando el producto no tiene piso", () => {
    expect(descuentoMaximoPct(3.92, 0)).toBeNull();
  });

  it("calcula el margen de negociación real del 6205", () => {
    // 3.92 -> 3.86 es 1.53 % de rebaja disponible.
    expect(descuentoMaximoPct(3.92, 3.86)).toBe(1.53);
  });

  it("el 6209 aguanta bastante más", () => {
    // 12.84 -> 11.96 es 6.85 %.
    expect(descuentoMaximoPct(12.84, 11.96)).toBe(6.85);
  });

  it("trunca hacia abajo y NUNCA hacia arriba", () => {
    // El exacto es 6.8535...; redondeando daría 6.85 igual, así que se usa un
    // caso donde redondear sí subiría: 41.32 -> 38.76 da 6.1955...%
    expect(descuentoMaximoPct(41.32, 38.76)).toBe(6.19);
  });

  it("el descuento máximo que devuelve SIEMPRE pasa el check de la base", () => {
    const casos: ReadonlyArray<readonly [number, number]> = [
      [3.92, 3.86],
      [12.84, 11.96],
      [15.16, 13.79],
      [7.56, 6.94],
      [14.23, 13.4],
      [41.32, 38.76],
      [39.47, 36.18],
    ];
    for (const [valor, piso] of casos) {
      const maximo = descuentoMaximoPct(valor, piso);
      expect(maximo).not.toBeNull();
      const revision = revisarPiso({
        cantidad: 1,
        valorUnitario: valor,
        descuentoPct: maximo as number,
        precioMinimo: piso,
      });
      expect(revision.ok).toBe(true);
    }
  });

  it("un céntimo más de descuento que el máximo ya rompe el piso", () => {
    for (const [valor, piso] of [
      [3.92, 3.86],
      [12.84, 11.96],
      [41.32, 38.76],
    ] as const) {
      const maximo = descuentoMaximoPct(valor, piso) as number;
      const revision = revisarPiso({
        cantidad: 1,
        valorUnitario: valor,
        descuentoPct: maximo + 0.01,
        precioMinimo: piso,
      });
      expect(revision.ok).toBe(false);
    }
  });

  it("sin espacio de rebaja devuelve 0, no un negativo", () => {
    expect(descuentoMaximoPct(3.86, 3.86)).toBe(0);
    expect(descuentoMaximoPct(3.5, 3.86)).toBe(0);
  });

  it("con valor unitario en cero no divide por cero", () => {
    expect(descuentoMaximoPct(0, 3.86)).toBe(0);
  });
});

describe("revisarPiso", () => {
  it("sin P.M. cargado deja pasar cualquier precio", () => {
    const r = revisarPiso({ cantidad: 10, valorUnitario: 0.01 });
    expect(r.ok).toBe(true);
    expect(r.piso).toBe(0);
    expect(r.descuentoMaximoPct).toBeNull();
  });

  it("vender exactamente en el piso está permitido", () => {
    const r = revisarPiso({
      cantidad: 1,
      valorUnitario: 3.86,
      precioMinimo: 3.86,
    });
    expect(r.ok).toBe(true);
    expect(r.faltantePorUnidad).toBe(0);
  });

  it("detecta el caso peligroso: precio de lista con descuento por encima", () => {
    // Es EL error que busca esta regla. El vendedor pone el precio de lista,
    // que respeta el piso, y encima le mete un 10 %: termina por debajo sin
    // haberlo notado.
    const r = revisarPiso({
      cantidad: 4,
      valorUnitario: 12.84,
      descuentoPct: 10,
      precioMinimo: 11.96,
    });
    expect(r.ok).toBe(false);
    expect(r.precioNeto).toBe(11.556);
    expect(r.faltantePorUnidad).toBe(0.404);
    expect(r.faltanteEnLinea).toBe(1.62); // 0.404 * 4 = 1.616 -> 1.62
    expect(r.descuentoMaximoPct).toBe(6.85);
  });

  it("informa el faltante de toda la línea, no solo el unitario", () => {
    const r = revisarPiso({
      cantidad: 100,
      valorUnitario: 41.32,
      descuentoPct: 20,
      precioMinimo: 38.76,
    });
    expect(r.ok).toBe(false);
    expect(r.precioNeto).toBe(33.056);
    expect(r.faltantePorUnidad).toBe(5.704);
    expect(r.faltanteEnLinea).toBe(570.4);
  });

  it("un valor unitario por debajo del piso falla aunque no haya descuento", () => {
    const r = revisarPiso({
      cantidad: 1,
      valorUnitario: 3.5,
      precioMinimo: 3.86,
    });
    expect(r.ok).toBe(false);
    expect(r.descuentoMaximoPct).toBe(0);
  });
});

describe("valorUnitarioMinimo", () => {
  it("sin descuento, el mínimo negociable es el piso mismo", () => {
    expect(valorUnitarioMinimo(11.96)).toBe(11.96);
  });

  it("con descuento puesto, el mínimo sube", () => {
    // Con 10 % encima hay que partir de más arriba para caer justo en 11.96.
    expect(valorUnitarioMinimo(11.96, 10)).toBe(13.2889);
  });

  it("redondea hacia arriba: el mínimo que devuelve SIEMPRE pasa el check", () => {
    const pisos = [3.86, 11.96, 13.79, 6.94, 13.4, 38.76, 36.18];
    const descuentos = [0, 2.5, 5, 7.35, 10, 15, 25];
    for (const piso of pisos) {
      for (const d of descuentos) {
        const minimo = valorUnitarioMinimo(piso, d) as number;
        const r = revisarPiso({
          cantidad: 1,
          valorUnitario: minimo,
          descuentoPct: d,
          precioMinimo: piso,
        });
        expect(r.ok).toBe(true);
      }
    }
  });

  it("un céntimo por debajo del mínimo ya rompe el piso", () => {
    for (const [piso, d] of [
      [11.96, 10],
      [38.76, 5],
      [3.86, 0],
    ] as const) {
      const minimo = valorUnitarioMinimo(piso, d) as number;
      const r = revisarPiso({
        cantidad: 1,
        valorUnitario: minimo - 0.01,
        descuentoPct: d,
        precioMinimo: piso,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("sin piso cargado no hay mínimo que respetar", () => {
    expect(valorUnitarioMinimo(0, 10)).toBe(0);
  });

  it("con 100 % de descuento no hay precio posible", () => {
    expect(valorUnitarioMinimo(11.96, 100)).toBeNull();
  });
});

describe("las dos palancas juntas", () => {
  // Willy, 21/08/2026: "si yo le doy precio de venta me está negociando y le
  // bajo, y aparte le doy un descuento". Bajar el unitario y descontar encima
  // son DOS rebajas sobre el mismo precio, y el piso las mira juntas.
  it("cada palanca por separado respeta el piso, pero juntas lo rompen", () => {
    const base = { cantidad: 1, precioMinimo: 11.96 } as const;

    // Solo negociar el unitario: 12.84 -> 12.20. Pasa.
    expect(revisarPiso({ ...base, valorUnitario: 12.2 }).ok).toBe(true);

    // Solo descontar sobre el precio de lista: 5 %. Pasa.
    expect(
      revisarPiso({ ...base, valorUnitario: 12.84, descuentoPct: 5 }).ok,
    ).toBe(true);

    // Las dos a la vez: 12.20 con 5 % encima = 11.59. NO pasa.
    const ambas = revisarPiso({
      ...base,
      valorUnitario: 12.2,
      descuentoPct: 5,
    });
    expect(ambas.ok).toBe(false);
    expect(ambas.precioNeto).toBe(11.59);
  });

  it("con el unitario ya negociado, el descuento máximo se recalcula", () => {
    // A precio de lista aguanta 6.85 %; ya negociado a 12.20, solo 1.96 %.
    expect(descuentoMaximoPct(12.84, 11.96)).toBe(6.85);
    expect(descuentoMaximoPct(12.2, 11.96)).toBe(1.96);
  });

  it("las dos respuestas que necesita la pantalla son coherentes entre sí", () => {
    // Con 5 % de descuento no puede bajar de 12.5895; y a 12.5895 el descuento
    // máximo vuelve a dar 5 %. Las dos funciones describen el mismo límite
    // desde lados opuestos.
    const piso = 11.96;
    const minimo = valorUnitarioMinimo(piso, 5) as number;
    expect(minimo).toBe(12.5895);
    expect(descuentoMaximoPct(minimo, piso)).toBe(5);
  });
});

describe("lineasBajoPiso", () => {
  it("una cotización que cumple devuelve un array vacío", () => {
    const malas = lineasBajoPiso([
      { cantidad: 2, valorUnitario: 3.92, precioMinimo: 3.86 },
      { cantidad: 1, valorUnitario: 12.84, descuentoPct: 5, precioMinimo: 11.96 },
      { cantidad: 3, valorUnitario: 41.32, precioMinimo: 38.76 },
    ]);
    expect(malas).toEqual([]);
  });

  it("devuelve solo las líneas malas, con su posición", () => {
    const malas = lineasBajoPiso([
      { cantidad: 2, valorUnitario: 3.92, precioMinimo: 3.86 },
      { cantidad: 1, valorUnitario: 12.84, descuentoPct: 15, precioMinimo: 11.96 },
      { cantidad: 3, valorUnitario: 41.32, precioMinimo: 38.76 },
      { cantidad: 1, valorUnitario: 7.56, descuentoPct: 30, precioMinimo: 6.94 },
    ]);
    expect(malas.map((m) => m.indice)).toEqual([1, 3]);
    expect(malas[0]?.descuentoMaximoPct).toBe(6.85);
  });

  it("las líneas sin piso no cuentan como malas", () => {
    const malas = lineasBajoPiso([
      { cantidad: 1, valorUnitario: 0.5 },
      { cantidad: 1, valorUnitario: 0.5, precioMinimo: 0 },
    ]);
    expect(malas).toEqual([]);
  });

  it("una cotización vacía no rompe nada", () => {
    expect(lineasBajoPiso([])).toEqual([]);
  });
});
