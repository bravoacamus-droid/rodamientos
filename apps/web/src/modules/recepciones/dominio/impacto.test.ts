import { describe, expect, it } from "vitest";

import { UMBRAL_VARIACION, calcularImpacto, explicar, margen } from "./impacto";

/**
 * Esto decide si Willy se entera de que un producto dejó de ser rentable el
 * día que llega, o dentro de tres meses cuando alguien cuadre el margen. No
 * bloquea nada: solo lo dice, que es lo que él pidió.
 */

const base = {
  costoUsd: 10,
  costoAnteriorUsd: 10,
  precioVenta: 12,
  precioMinimo: 0,
};

describe("margen", () => {
  it("se mide sobre el costo, como en cotizaciones", () => {
    // 12 sobre un costo de 10 son 20 puntos sobre el costo, no 16,67 sobre el
    // precio. Dos definiciones en el mismo sistema serían dos respuestas.
    expect(margen(12, 10)).toBe(20);
  });

  it("sin costo o sin precio no hay margen que calcular", () => {
    expect(margen(12, 0)).toBeNull();
    expect(margen(0, 10)).toBeNull();
  });
});

describe("cuándo merece decirse", () => {
  it("un costo igual no dice nada", () => {
    expect(calcularImpacto(base).gravedad).toBe("nada");
    expect(explicar(calcularImpacto(base))).toBeNull();
  });

  it("un cambio pequeño tampoco: es ruido del tipo de cambio", () => {
    const i = calcularImpacto({ ...base, costoUsd: 10.5 });
    expect(i.variacionPct).toBe(5);
    expect(i.gravedad).toBe("nada");
  });

  it("a partir del umbral sí", () => {
    const i = calcularImpacto({ ...base, costoUsd: 11 });
    expect(i.variacionPct).toBe(UMBRAL_VARIACION);
    expect(i.gravedad).toBe("atencion");
  });

  it("y también cuando baja: enterarse de que algo salió más barato sirve", () => {
    const i = calcularImpacto({ ...base, costoUsd: 8 });
    expect(i.variacionPct).toBe(-20);
    expect(i.gravedad).toBe("atencion");
    expect(explicar(i)).toContain("bajó");
  });
});

describe("el efecto en el margen", () => {
  it("dice de cuánto a cuánto", () => {
    const i = calcularImpacto({ ...base, costoUsd: 11.5 });
    expect(i.margenAntes).toBe(20);
    expect(i.margenAhora).toBe(4.35);
    expect(explicar(i)).toBe(
      "El costo subió un 15.0 %: el margen pasa de 20.0 % a 4.3 %.",
    );
  });

  it("la primera compra no tiene con qué comparar, y no se inventa", () => {
    const i = calcularImpacto({ ...base, costoAnteriorUsd: null, costoUsd: 10 });
    expect(i.variacionPct).toBeNull();
    expect(i.margenAntes).toBeNull();
    expect(i.margenAhora).toBe(20);
    expect(i.gravedad).toBe("nada");
  });
});

describe("lo grave", () => {
  it("traerlo cuesta más que el precio mínimo fijado", () => {
    // Es lo peor que puede decir esta cuenta: el piso que Willy fijó ya no
    // cubre lo que cuesta traerlo.
    const i = calcularImpacto({ ...base, costoUsd: 11, precioMinimo: 10.5 });
    expect(i.bajoPiso).toBe(true);
    expect(i.gravedad).toBe("grave");
    expect(explicar(i)).toContain("precio mínimo");
  });

  it("un precio mínimo en cero NO es un piso de cero", () => {
    // Es que nadie lo fijó. Tratarlo como piso marcaría medio catálogo en rojo.
    const i = calcularImpacto({ ...base, costoUsd: 50, precioMinimo: 0, precioVenta: 0 });
    expect(i.bajoPiso).toBe(false);
  });

  it("vender al precio de hoy pierde dinero", () => {
    const i = calcularImpacto({ ...base, costoUsd: 13 });
    expect(i.enPerdida).toBe(true);
    expect(i.gravedad).toBe("grave");
    expect(explicar(i)).toContain("pierde dinero");
  });

  it("lo del piso manda sobre lo de la pérdida: es la regla que él fijó", () => {
    const i = calcularImpacto({ ...base, costoUsd: 20, precioMinimo: 15 });
    expect(i.bajoPiso).toBe(true);
    expect(i.enPerdida).toBe(true);
    expect(explicar(i)).toContain("precio mínimo");
  });

  it("un producto sin precio de venta no da falsos positivos", () => {
    // El maestro de Willy llegó sin precios: si esto marcara en rojo los 790,
    // el panel nacería inservible.
    const i = calcularImpacto({
      costoUsd: 10,
      costoAnteriorUsd: null,
      precioVenta: 0,
      precioMinimo: 0,
    });
    expect(i.gravedad).toBe("nada");
    expect(i.enPerdida).toBe(false);
  });
});
