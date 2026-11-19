import { describe, expect, it } from "vitest";

import { TANDA, TOPE_VER_MAS, conCuantos, leerCuantos } from "./ver-mas";

describe("leerCuantos", () => {
  it("sin valor, o con basura, la primera tanda", () => {
    expect(leerCuantos(undefined)).toBe(TANDA);
    expect(leerCuantos("abc")).toBe(TANDA);
    expect(leerCuantos("-60")).toBe(TANDA);
    expect(leerCuantos("10")).toBe(TANDA);
  });

  it("múltiplos de la tanda, redondeando hacia abajo", () => {
    expect(leerCuantos("60")).toBe(60);
    expect(leerCuantos("75")).toBe(60);
    expect(leerCuantos(["90", "30"])).toBe(90);
  });

  it("con tope", () => {
    expect(leerCuantos("100000")).toBe(TOPE_VER_MAS);
  });
});

describe("con otra tanda (el kardex va de 20 en 20)", () => {
  it("lee múltiplos de 20", () => {
    expect(leerCuantos(undefined, 20)).toBe(20);
    expect(leerCuantos("40", 20)).toBe(40);
    expect(leerCuantos("50", 20)).toBe(40);
    expect(leerCuantos("100000", 20)).toBe(TOPE_VER_MAS);
  });

  it("la primera tanda no va en la URL", () => {
    expect(conCuantos("q=x&n=40", 20, 20)).toBe("?q=x");
    expect(conCuantos("q=x", 40, 20)).toBe("?q=x&n=40");
  });
});

describe("conCuantos", () => {
  it("cambia n y conserva los filtros", () => {
    expect(conCuantos("q=6205&tipo=salida", 60)).toBe("?q=6205&tipo=salida&n=60");
  });

  it("quita la paginación vieja y el n de siempre", () => {
    expect(conCuantos("q=x&n=60&cursor=abc&dir=ant", TANDA)).toBe("?q=x");
    expect(conCuantos("", TANDA)).toBe("?");
  });
});
