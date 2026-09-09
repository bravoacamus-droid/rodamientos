import { describe, expect, it } from "vitest";

import { conIgv, soloIgv, TASA_IGV } from "./igv";

describe("conIgv", () => {
  it("suma el 18 % y redondea a céntimo", () => {
    expect(conIgv(100)).toBe(118);
    expect(conIgv(14)).toBe(16.52); // CMP-26-00012, tal cual está en la base
  });

  it("no inventa un total cuando no hay subtotal", () => {
    // Un 0 aquí es «todavía no hay nada elegido», no «sale gratis».
    expect(conIgv(0)).toBe(0);
    expect(conIgv(Number.NaN)).toBe(0);
  });

  it("la tasa se puede pasar, porque en Perú ya cambió una vez", () => {
    expect(conIgv(100, 0.16)).toBe(116);
  });
});

describe("soloIgv", () => {
  it("da la parte del impuesto, no el total", () => {
    expect(soloIgv(100)).toBe(18);
    expect(soloIgv(14)).toBe(2.52);
  });

  it("cuadra con el total: subtotal + IGV = con IGV", () => {
    // El redondeo se hace sobre el total y el IGV se saca de ahí, así que los
    // dos números que se enseñan juntos suman lo que dice el tercero. Con dos
    // redondeos independientes esto se descuadra por un céntimo, y un céntimo
    // que no cuadra en pantalla cuesta media hora de teléfono.
    for (const sub of [14, 33.33, 284, 0.2, 1234.56]) {
      expect(Number((sub + soloIgv(sub)).toFixed(2))).toBe(conIgv(sub));
    }
  });
});

describe("TASA_IGV", () => {
  it("es la general, la misma que usa la base en crear_compra", () => {
    expect(TASA_IGV).toBe(0.18);
  });
});
