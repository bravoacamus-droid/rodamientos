import { describe, expect, it } from "vitest";

import {
  baseValorizada,
  costearRecepcion,
  factorGastos,
  redondear6,
} from "./costeo";

/**
 * Los números esperados de este archivo NO están calculados a mano: salen de
 * ejecutar la misma aritmética en el Postgres del proyecto, con los mismos
 * tipos (`numeric(14,2)` la base, `numeric(12,6)` el factor, `round(...,4)` el
 * costo) que usa `recepcionar_mercaderia()`.
 *
 * Es lo que le da valor a la prueba: si alguien "mejora" el redondeo de aquí,
 * la pantalla empezaría a enseñar un costo distinto del que acaba en el
 * kardex, y esto salta.
 */

describe("factor de gastos", () => {
  it("es 1 cuando no hay gastos que repartir", () => {
    expect(factorGastos(100, 0)).toBe(1);
  });

  it("es 1 cuando no hay base sobre la que repartir", () => {
    // La función solo entra al reparto con `v_gastos > 0 and v_base > 0`. Sin
    // esta guarda sería una división por cero.
    expect(factorGastos(0, 50)).toBe(1);
  });

  it("es 1 con gastos negativos, que no deberían llegar pero llegan", () => {
    expect(factorGastos(100, -10)).toBe(1);
  });

  it("se redondea a 6 decimales, como el numeric(12,6) de la función", () => {
    // 1 + 25/83.14 = 1.3006975462... y Postgres lo deja en 1.300698.
    expect(factorGastos(83.14, 25)).toBe(1.300698);
  });
});

describe("base valorizada", () => {
  it("suma cantidad por costo y redondea a dos decimales", () => {
    expect(
      baseValorizada([
        { cantidad: 10, costoUnitario: 3.26 },
        { cantidad: 4, costoUnitario: 12.635 },
      ]),
    ).toBe(83.14);
  });

  it("es cero sin líneas", () => {
    expect(baseValorizada([])).toBe(0);
  });
});

describe("costeo de la recepción", () => {
  it("sin gastos deja el costo tal como se tecleó", () => {
    const r = costearRecepcion([
      { cantidad: 10, costoUnitario: 3.26 },
      { cantidad: 4, costoUnitario: 12.635 },
    ]);

    expect(r.factor).toBe(1);
    expect(r.gastos).toBe(0);
    expect(r.lineas.map((l) => l.costoFinal)).toEqual([3.26, 12.635]);
    expect(r.total).toBe(83.14);
    expect(r.totalFinal).toBe(83.14);
    expect(r.unidades).toBe(14);
  });

  it("reparte los gastos igual que Postgres", () => {
    const r = costearRecepcion(
      [
        { cantidad: 10, costoUnitario: 3.26 },
        { cantidad: 4, costoUnitario: 12.635 },
      ],
      25,
    );

    expect(r.base).toBe(83.14);
    expect(r.factor).toBe(1.300698);
    expect(r.lineas.map((l) => l.costoFinal)).toEqual([4.2403, 16.4343]);
    expect(r.lineas.map((l) => l.importeFinal)).toEqual([42.4, 65.74]);
    expect(r.totalFinal).toBe(108.14);
  });

  it("reparte céntimos sueltos igual que Postgres", () => {
    // Caso con residuo de redondeo: 10 de gastos sobre una base de 19.71 y
    // tres líneas de importes muy desiguales.
    const r = costearRecepcion(
      [
        { cantidad: 3, costoUnitario: 1.11 },
        { cantidad: 7, costoUnitario: 2.33 },
        { cantidad: 1, costoUnitario: 0.07 },
      ],
      10,
    );

    expect(r.base).toBe(19.71);
    expect(r.factor).toBe(1.507357);
    expect(r.lineas.map((l) => l.costoFinal)).toEqual([1.6732, 3.5121, 0.1055]);
    expect(r.lineas.map((l) => l.importeFinal)).toEqual([5.02, 24.58, 0.11]);
  });

  it("conserva el importe sin gastos junto al que sí los lleva", () => {
    // La pantalla enseña las dos columnas: lo que se pagó al proveedor y lo
    // que va a costar en almacén. Perder la primera dejaría al operador sin
    // poder cuadrar contra la factura que tiene delante.
    const r = costearRecepcion([{ cantidad: 10, costoUnitario: 3.26 }], 25);

    expect(r.lineas[0]?.costoUnitario).toBe(3.26);
    expect(r.lineas[0]?.importe).toBe(32.6);
    expect(r.lineas[0]?.costoFinal).toBeGreaterThan(3.26);
  });

  it("aguanta una recepción vacía sin dividir por cero", () => {
    const r = costearRecepcion([], 100);

    expect(r.base).toBe(0);
    expect(r.factor).toBe(1);
    expect(r.total).toBe(0);
    expect(r.totalFinal).toBe(0);
    expect(r.unidades).toBe(0);
  });
});

describe("redondeo a 6 decimales", () => {
  it("no arrastra el error binario de la coma flotante", () => {
    // 1.0000005 en binario es 1.00000049999...; un Math.round pelado lo
    // dejaría en 1.000000.
    expect(redondear6(1.0000005)).toBe(1.000001);
    expect(redondear6(1.3006975462)).toBe(1.300698);
  });
});
