import { describe, expect, it } from "vitest";

import {
  calcularTotales,
  importeLinea,
  margenLinea,
  redondear2,
  valorParaMargen,
  type LineaCalculo,
} from "./totales";

const linea = (p: Partial<LineaCalculo> = {}): LineaCalculo => ({
  cantidad: 1,
  valorUnitario: 100,
  ...p,
});

describe("importeLinea", () => {
  it("multiplica cantidad por valor unitario", () => {
    expect(importeLinea(linea({ cantidad: 3, valorUnitario: 62 }))).toBe(186);
  });

  it("aplica el descuento por línea", () => {
    expect(
      importeLinea(linea({ cantidad: 2, valorUnitario: 50, descuentoPct: 10 })),
    ).toBe(90);
  });

  it("sin descuento equivale a descuento cero", () => {
    const con = importeLinea(linea({ descuentoPct: 0 }));
    const sin = importeLinea(linea());
    expect(con).toBe(sin);
  });

  it("redondea a dos decimales", () => {
    // 3 × 38.555 = 115.665 → 115.67, no 115.665
    expect(importeLinea(linea({ cantidad: 3, valorUnitario: 38.555 }))).toBe(
      115.67,
    );
  });

  it("un descuento del 100 % deja la línea en cero", () => {
    expect(importeLinea(linea({ descuentoPct: 100 }))).toBe(0);
  });

  /**
   * Los números de este bloque NO están calculados a mano: salen de ejecutar
   * `round(cantidad * valor_unitario * (1 - descuento_pct/100.0), 2)` en el
   * Postgres del proyecto, que es la columna generada `cotizacion_items.importe`.
   *
   * Cada uno de ellos daba un céntimo de menos con el redondeo anterior
   * —`redondear2(cantidad × valor × factor)`—, porque el producto en coma
   * flotante cae justo por debajo del medio céntimo.
   */
  describe("cuadra con la columna generada de Postgres", () => {
    it("el caso de libro: 3 × 1.005", () => {
      expect(importeLinea(linea({ cantidad: 3, valorUnitario: 1.005 }))).toBe(3.02);
    });

    it("con importes de verdad del catálogo", () => {
      expect(importeLinea(linea({ cantidad: 44.9, valorUnitario: 214.95 }))).toBe(
        9651.26,
      );
      expect(importeLinea(linea({ cantidad: 19, valorUnitario: 216.975 }))).toBe(
        4122.53,
      );
      expect(
        importeLinea(linea({ cantidad: 156.25, valorUnitario: 294.6584 })),
      ).toBe(46040.38);
    });

    it("con descuento por medio, que son TRES factores", () => {
      expect(
        importeLinea(linea({ cantidad: 3, valorUnitario: 1.005, descuentoPct: 33.33 })),
      ).toBe(2.01);
      expect(
        importeLinea(linea({ cantidad: 7, valorUnitario: 2.4567, descuentoPct: 12.5 })),
      ).toBe(15.05);
      expect(
        importeLinea(linea({ cantidad: 2.5, valorUnitario: 4.005, descuentoPct: 10 })),
      ).toBe(9.01);
    });

    /**
     * El motivo de usar enteros grandes y no enteros normales: aquí el
     * numerador exacto ronda 10^17, muy por encima de 2^53. Con enteros
     * normales el resultado sería silenciosamente distinto.
     */
    it("aguanta la línea más grande que la base admite", () => {
      expect(
        importeLinea(
          linea({ cantidad: 9999.99, valorUnitario: 9999.9999, descuentoPct: 99.99 }),
        ),
      ).toBe(9999.99);
    });

    it("una línea de céntimos no se va a cero por el camino", () => {
      expect(importeLinea(linea({ cantidad: 1, valorUnitario: 0.015, descuentoPct: 50 }))).toBe(
        0.01,
      );
    });
  });
});

describe("calcularTotales", () => {
  it("una cotización vacía da todo en cero", () => {
    expect(calcularTotales([])).toEqual({
      subtotal: 0,
      descuentoTotal: 0,
      igv: 0,
      total: 0,
      costoTotal: 0,
      margenPct: 0,
    });
  });

  it("aplica el IGV del 18 % sobre el subtotal", () => {
    const t = calcularTotales([linea({ cantidad: 1, valorUnitario: 100 })]);
    expect(t.subtotal).toBe(100);
    expect(t.igv).toBe(18);
    expect(t.total).toBe(118);
  });

  it("el total es siempre subtotal más IGV", () => {
    const t = calcularTotales([
      linea({ cantidad: 3, valorUnitario: 62 }),
      linea({ cantidad: 12, valorUnitario: 6.5 }),
      linea({ cantidad: 1, valorUnitario: 17.5 }),
    ]);
    expect(redondear2(t.subtotal + t.igv)).toBe(t.total);
  });

  it("suma importes ya redondeados, no redondea al final", () => {
    // Tres líneas de 0.005 cada una. Redondeando por línea: 0.01 × 3 = 0.03.
    // Sumando crudo (0.015) y redondeando al final saldría 0.02, y el total
    // no cuadraría con la columna Importe que el cliente ve en el PDF.
    const t = calcularTotales([
      linea({ cantidad: 1, valorUnitario: 0.005 }),
      linea({ cantidad: 1, valorUnitario: 0.005 }),
      linea({ cantidad: 1, valorUnitario: 0.005 }),
    ]);
    expect(t.subtotal).toBe(0.03);
  });

  it("acumula el descuento total frente al precio de lista", () => {
    const t = calcularTotales([
      linea({ cantidad: 1, valorUnitario: 100, descuentoPct: 10 }),
      linea({ cantidad: 2, valorUnitario: 50, descuentoPct: 20 }),
    ]);
    // bruto 100 + 100 = 200; neto 90 + 80 = 170
    expect(t.subtotal).toBe(170);
    expect(t.descuentoTotal).toBe(30);
  });

  it("calcula el margen contra el subtotal, sin incluir IGV", () => {
    const t = calcularTotales([
      linea({ cantidad: 1, valorUnitario: 100, costoUnitario: 60 }),
    ]);
    // (100 - 60) / 100 = 40 %. Si contara el IGV daría ~49 %, que es falso.
    expect(t.margenPct).toBe(40);
  });

  it("sin costo cargado devuelve 0, no 100", () => {
    // Con costoTotal = 0 la fórmula daría 100 %. Sería mentir: el costo no
    // está cargado, no es que se venda con margen total.
    const t = calcularTotales([linea({ valorUnitario: 100 })]);
    expect(t.margenPct).toBe(0);
    expect(Number.isNaN(t.margenPct)).toBe(false);
  });

  it("admite margen negativo: vender bajo el costo se tiene que ver", () => {
    const t = calcularTotales([
      linea({ cantidad: 1, valorUnitario: 50, costoUnitario: 80 }),
    ]);
    expect(t.margenPct).toBe(-60);
  });

  it("un caso realista de rodamientos cuadra al céntimo", () => {
    const t = calcularTotales([
      { cantidad: 4, valorUnitario: 62, costoUnitario: 38.5 }, // 248.00
      { cantidad: 20, valorUnitario: 6.5, costoUnitario: 3.2 }, // 130.00
      { cantidad: 6, valorUnitario: 4, costoUnitario: 1.8 }, //  24.00
    ]);
    expect(t.subtotal).toBe(402);
    expect(t.igv).toBe(72.36);
    expect(t.total).toBe(474.36);
    // 4×38.50 + 20×3.20 + 6×1.80 = 154 + 64 + 10.80
    expect(t.costoTotal).toBe(228.8);
    expect(t.margenPct).toBe(43.08);
  });
});

describe("margenLinea", () => {
  it("devuelve el margen porcentual de la línea", () => {
    expect(margenLinea(linea({ valorUnitario: 100, costoUnitario: 75 }))).toBe(
      25,
    );
  });

  it("devuelve null sin costo — no es lo mismo que margen cero", () => {
    expect(margenLinea(linea({ valorUnitario: 100 }))).toBeNull();
    expect(margenLinea(linea({ valorUnitario: 100, costoUnitario: 0 }))).toBeNull();
  });

  it("devuelve null si la línea vale cero", () => {
    expect(margenLinea(linea({ valorUnitario: 0, costoUnitario: 10 }))).toBeNull();
  });

  it("tiene en cuenta el descuento", () => {
    // 100 con 20 % de descuento = 80; costo 60 → (80-60)/80 = 25 %
    expect(
      margenLinea(
        linea({ valorUnitario: 100, descuentoPct: 20, costoUnitario: 60 }),
      ),
    ).toBe(25);
  });
});

describe("valorParaMargen", () => {
  it("devuelve el precio que alcanza el margen pedido", () => {
    expect(valorParaMargen(60, 40)).toBe(100);
  });

  it("es coherente de ida y vuelta con margenLinea", () => {
    const valorUnitario = valorParaMargen(38.5, 30);
    const margen = margenLinea({ cantidad: 1, valorUnitario, costoUnitario: 38.5 });
    expect(margen).toBeCloseTo(30, 1);
  });

  it("un margen del 100 % o más devuelve cero en vez de infinito", () => {
    expect(valorParaMargen(50, 100)).toBe(0);
    expect(valorParaMargen(50, 150)).toBe(0);
  });
});
