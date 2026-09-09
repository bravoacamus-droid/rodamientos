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

  describe("cuando el costo es imposible", () => {
    it("el caso real del 09/09: vender a 30.85 algo que costó 0.20", () => {
      // Lo que el tablero llegó a enseñar con una sola factura:
      // «USD 31 · 15325.0% sobre el costo». La cuenta estaba bien; el costo
      // no. Un SKF de treinta dólares no cuesta veinte céntimos.
      const r = estadoDelMargen(30.85, 30.85, 0.2);
      expect(r.tipo).toBe("costo_dudoso");
      if (r.tipo === "costo_dudoso") expect(r.pct).toBeGreaterThan(15000);
    });

    it("gana sobre el caso parcial: un costo falso lo estropea igual", () => {
      // Cubra el 10 % de la venta o el 100 %, si el costo es basura el
      // porcentaje que saldría también lo es.
      expect(estadoDelMargen(1000, 100, 0.5).tipo).toBe("costo_dudoso");
    });

    it("un margen alto de verdad SÍ se enseña", () => {
      // 150 % es extraordinario y puede pasar. El umbral está en 300 justo
      // para no callar una venta buena: lo que se corta es lo absurdo.
      const r = estadoDelMargen(250, 250, 100);
      expect(r.tipo).toBe("completo");
      if (r.tipo === "completo") expect(r.pct).toBe(150);
    });

    it("justo en el umbral todavía se enseña", () => {
      // 300 exacto no es imposible; 300.01 sí. El corte tiene que estar en un
      // sitio y conviene que el test diga en cuál.
      expect(estadoDelMargen(400, 400, 100).tipo).toBe("completo");
      expect(estadoDelMargen(401, 401, 100).tipo).toBe("costo_dudoso");
    });
  });
});
