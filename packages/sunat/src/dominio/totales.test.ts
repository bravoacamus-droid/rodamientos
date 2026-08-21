import { describe, it, expect } from "vitest";
import { totalesDocumento, totalesGuardados } from "./totales";

/**
 * Las cuentas del pie de un documento. Se prueban porque son dinero y porque el
 * error clásico —multiplicar por 0,18 un precio que ya lleva el IGV dentro— da un
 * número creíble: nadie lo nota hasta que el comprobante no cuadra con lo cobrado.
 *
 * Los importes del primer bloque son los de la captura de referencia que pasó el
 * cliente: 14 + 28 = 42, con 10 de descuento, total 32.
 */
describe("totalesDocumento", () => {
  const lineas = [
    { quantity: 1, unit_price: 14 },
    { quantity: 1, unit_price: 28 },
  ];

  it("suma las líneas y descuenta lo pedido", () => {
    const t = totalesDocumento(lineas, { descuento: 10 });
    expect(t.subtotal).toBe(42);
    expect(t.descuento).toBe(10);
    expect(t.total).toBe(32);
  });

  it("saca la base DIVIDIENDO, no multiplicando", () => {
    const t = totalesDocumento(lineas, { descuento: 10 });
    // 32 / 1,18 = 27,12 y 32 − 27,12 = 4,88. Multiplicar 32 × 0,18 daría 5,76,
    // un impuesto de más y un total de 37,76 que nadie cobró.
    expect(t.gravado).toBe(27.12);
    expect(t.igv).toBe(4.88);
  });

  it("base + IGV es exactamente el total, sin céntimos sueltos", () => {
    // 33,90 es el caso donde redondear base e impuesto por separado se desvía.
    for (const p of [33.9, 0.1, 99.99, 1234.56, 7]) {
      const t = totalesDocumento([{ quantity: 3, unit_price: p }]);
      expect(t.gravado + t.igv).toBeCloseTo(t.total, 10);
    }
  });

  it("sin descuento no toca nada", () => {
    const t = totalesDocumento(lineas);
    expect(t.subtotal).toBe(42);
    expect(t.descuento).toBe(0);
    expect(t.total).toBe(42);
  });

  it("un descuento mayor que el subtotal se recorta: el total no puede ser negativo", () => {
    const t = totalesDocumento(lineas, { descuento: 999 });
    expect(t.descuento).toBe(42);
    expect(t.total).toBe(0);
    expect(t.igv).toBe(0);
  });

  it("un descuento negativo se ignora en vez de sumar", () => {
    const t = totalesDocumento(lineas, { descuento: -10 });
    expect(t.descuento).toBe(0);
    expect(t.total).toBe(42);
  });

  it("respeta otra tasa de IGV", () => {
    const t = totalesDocumento([{ quantity: 1, unit_price: 110 }], { tasaIgv: 10 });
    expect(t.gravado).toBe(100);
    expect(t.igv).toBe(10);
    expect(t.tasa).toBe(10);
  });

  it("aguanta líneas vacías o con basura sin devolver NaN", () => {
    const t = totalesDocumento([
      { quantity: Number("x"), unit_price: 10 },
      { quantity: 2, unit_price: 5 },
    ]);
    expect(t.total).toBe(10);
  });

  it("sin líneas todo es cero", () => {
    const t = totalesDocumento([]);
    expect(t).toMatchObject({ subtotal: 0, descuento: 0, total: 0, gravado: 0, igv: 0 });
  });
});

describe("totalesGuardados", () => {
  it("reconstruye el subtotal sumando el descuento al total, no las líneas", () => {
    const t = totalesGuardados(32, 10);
    expect(t.subtotal).toBe(42);
    expect(t.total).toBe(32);
    expect(t.gravado).toBe(27.12);
    expect(t.igv).toBe(4.88);
  });

  it("un documento sin descuento se lee igual", () => {
    const t = totalesGuardados(42, null);
    expect(t.subtotal).toBe(42);
    expect(t.descuento).toBe(0);
  });

  it("da los mismos números que el cálculo en pantalla", () => {
    const enPantalla = totalesDocumento(
      [{ quantity: 2, unit_price: 33.9 }, { quantity: 1, unit_price: 15.5 }],
      { descuento: 3.4 },
    );
    const alLeerlo = totalesGuardados(enPantalla.total, enPantalla.descuento);
    expect(alLeerlo).toEqual(enPantalla);
  });
});
