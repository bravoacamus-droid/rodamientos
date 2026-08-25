import { describe, expect, it } from "vitest";

import { fallo, mensajeDeError } from "./errores";

describe("mensajeDeError", () => {
  it("devuelve el mensaje de un Error normal", () => {
    expect(mensajeDeError(new Error("se cayó la red"))).toBe("se cayó la red");
  });

  it("devuelve una cadena tal cual", () => {
    expect(mensajeDeError("sin sesión")).toBe("sin sesión");
  });

  /**
   * El caso que motivó el archivo: el error de PostgREST es un objeto plano,
   * no un `Error`, así que `String(e)` daba «[object Object]» y la ficha de
   * producto no decía nunca qué le pasaba.
   */
  it("desarma el error de PostgREST en vez de dar [object Object]", () => {
    const real = {
      code: "PGRST200",
      details:
        "Searched for a foreign key relationship between 'productos' and 'familias' in the schema 'public', but no matches were found.",
      hint: "Perhaps you meant 'subfamilias' instead of 'familias'.",
      message:
        "Could not find a relationship between 'productos' and 'familias' in the schema cache",
    };

    const mensaje = mensajeDeError(real);

    expect(mensaje).not.toContain("[object Object]");
    expect(mensaje).toContain("Could not find a relationship");
    expect(mensaje).toContain("Perhaps you meant 'subfamilias'");
    expect(mensaje).toContain("(PGRST200)");
  });

  it("aguanta un error con solo message", () => {
    expect(mensajeDeError({ message: "permiso denegado" })).toBe("permiso denegado");
  });

  it("no inventa paréntesis cuando no hay código", () => {
    expect(mensajeDeError({ message: "algo" })).toBe("algo");
  });

  it("cae en un texto legible ante algo irreconocible", () => {
    expect(mensajeDeError(null)).toBe("Error desconocido.");
    expect(mensajeDeError(undefined)).toBe("Error desconocido.");
    expect(mensajeDeError({})).toBe("Error desconocido.");
    expect(mensajeDeError(42)).toBe("Error desconocido.");
  });

  it("un Error sin mensaje no se traga el resto", () => {
    expect(mensajeDeError(new Error(""))).toBe("Error desconocido.");
  });
});

describe("fallo", () => {
  it("envuelve el mensaje en la forma que esperan los módulos", () => {
    expect(fallo({ message: "roto", code: "42P01" })).toEqual({
      ok: false,
      error: "roto (42P01)",
    });
  });
});
