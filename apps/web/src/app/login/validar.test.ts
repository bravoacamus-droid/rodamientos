import { describe, expect, it } from "vitest";

import { destinoSeguro, esquemaLogin, problemaContrasenaNueva } from "./validar";

const error = (datos: { correo: string; clave: string }) => {
  const r = esquemaLogin.safeParse(datos);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("esquemaLogin", () => {
  it("limpia los bordes y las mayúsculas del correo", () => {
    const r = esquemaLogin.parse({ correo: "  Willy@Rodatech.PE ", clave: "secreta1" });
    expect(r.correo).toBe("willy@rodatech.pe");
  });

  it("rechaza espacios en medio del correo y correos mal escritos", () => {
    expect(error({ correo: "wi lly@rodatech.pe", clave: "x" })).toBe("El correo no puede tener espacios.");
    expect(error({ correo: "willy@", clave: "x" })).toMatch(/no es válido/);
    expect(error({ correo: "   ", clave: "x" })).toBe("Escriba su correo.");
  });

  it("rechaza la contraseña vacía, de solo espacios o con espacios en los bordes", () => {
    expect(error({ correo: "a@b.pe", clave: "" })).toBe("Escriba su contraseña.");
    expect(error({ correo: "a@b.pe", clave: "     " })).toBe("Escriba su contraseña.");
    expect(error({ correo: "a@b.pe", clave: " clave123" })).toMatch(/empezar ni terminar/);
    expect(error({ correo: "a@b.pe", clave: "clave 123" })).toBeNull();
  });
});

describe("destinoSeguro", () => {
  it("deja las rutas internas", () => {
    expect(destinoSeguro("/pedidos?etapa=x")).toBe("/pedidos?etapa=x");
  });
  it("corta los trampolines a otro dominio", () => {
    for (const malo of ["//evil.com", "/\\evil.com", "/\tevil.com", "https://evil.com", "evil.com", null]) {
      expect(destinoSeguro(malo)).toBe("/dashboard");
    }
  });
});

describe("problemaContrasenaNueva", () => {
  it("exige mínimo, sin bordes con espacio y con máximo", () => {
    expect(problemaContrasenaNueva("        ", 8)).toMatch(/empezar ni terminar/);
    expect(problemaContrasenaNueva("corta", 8)).toMatch(/al menos 8/);
    expect(problemaContrasenaNueva("x".repeat(73), 8)).toMatch(/72/);
    expect(problemaContrasenaNueva("una buena clave", 8)).toBeNull();
  });
});
