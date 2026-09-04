import { describe, expect, it } from "vitest";

import { estadoDelMargen } from "./margen";

describe("estadoDelMargen", () => {
  it("sin ningún costo registrado NO hay margen", () => {
    // El caso del 04/09: 201.797 vendidos, cero costo, y el tablero decía que
    // el margen eran los 201.797 enteros. La venta entera como ganancia.
    expect(estadoDelMargen(201796.79, 0, 0)).toEqual({ tipo: "sin_costo" });
  });

  it("con todo el costo conocido, el margen habla de la venta entera", () => {
    expect(estadoDelMargen(1000, 1000, 800)).toEqual({
      tipo: "completo",
      margen: 200,
      pct: 25,
    });
  });

  it("con una parte, dice el margen DE ESA PARTE y qué parte es", () => {
    // Es el caso permanente: los 479 del histórico nunca tendrán costo, así
    // que todo rango hacia atrás mezcla los dos.
    expect(estadoDelMargen(1000, 400, 300)).toEqual({
      tipo: "parcial",
      margen: 100,
      pct: 33.33,
      cubrePct: 40,
    });
  });

  it("el margen NUNCA es la venta entera cuando falta costo", () => {
    // La comprobación que resume el fallo. Antes: 1000 - 300 = 700 sobre una
    // venta de 1000, contando como ganancia los 600 de los que no se sabe
    // nada.
    const r = estadoDelMargen(1000, 400, 300);
    expect(r.tipo).toBe("parcial");
    if (r.tipo === "parcial") expect(r.margen).toBeLessThan(1000);
  });

  it("un céntimo de diferencia no merece una frase", () => {
    // Puede venir del redondeo de dos sumas distintas, no de una venta sin
    // costo. Avisar de eso sería ruido en cada periodo.
    expect(estadoDelMargen(1000, 999.995, 800).tipo).toBe("completo");
  });

  it("una venta con costo pero sin venta no cuenta como margen", () => {
    expect(estadoDelMargen(0, 0, 0)).toEqual({ tipo: "sin_costo" });
  });

  it("un margen negativo se dice tal cual: vender bajo costo es la noticia", () => {
    expect(estadoDelMargen(1000, 1000, 1200)).toEqual({
      tipo: "completo",
      margen: -200,
      pct: -16.67,
    });
  });
});
