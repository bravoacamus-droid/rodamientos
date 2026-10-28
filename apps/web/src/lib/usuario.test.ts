import { describe, expect, it } from "vitest";

import { esCorreo, esquemaUsuarioOpcional, esUsuarioRepetido, normalizarUsuario, problemaUsuario } from "./usuario";

const error = (v: string) => {
  const r = esquemaUsuarioOpcional.safeParse(v);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("problemaUsuario", () => {
  it("acepta letras, números, punto, guion y guion bajo", () => {
    for (const bueno of ["wfernandez", "w.fernandez", "carlos_ventas", "almacen-2", "abc", "a".repeat(30)]) {
      expect(problemaUsuario(bueno)).toBeNull();
    }
  });

  it("rechaza la «@»: un usuario no puede ser un correo", () => {
    expect(problemaUsuario("willy@rodatech.pe")).toMatch(/no lleva «@»/);
  });

  it("rechaza espacios, tildes, eñes y símbolos", () => {
    expect(problemaUsuario("willy f")).toMatch(/espacios/);
    expect(problemaUsuario("josé")).toMatch(/sin tilde/);
    expect(problemaUsuario("muñoz")).toMatch(/sin tilde/);
    expect(problemaUsuario("willy!")).toMatch(/sin tilde/);
  });

  it("rechaza los cortos y los largos", () => {
    expect(problemaUsuario("ab")).toMatch(/de 3 a 30/);
    expect(problemaUsuario("a".repeat(31))).toMatch(/de 3 a 30/);
  });
});

describe("esquemaUsuarioOpcional", () => {
  it("normaliza: bordes fuera y en minúsculas", () => {
    expect(esquemaUsuarioOpcional.parse("  WFernandez ")).toBe("wfernandez");
    expect(normalizarUsuario(" A.B ")).toBe("a.b");
  });

  it("vacío es «no tengo» y se guarda como null", () => {
    expect(esquemaUsuarioOpcional.parse("")).toBeNull();
    expect(esquemaUsuarioOpcional.parse("   ")).toBeNull();
  });

  it("dice qué corregir", () => {
    expect(error("Willy Fernández")).toMatch(/espacios/);
    expect(error("x")).toMatch(/de 3 a 30/);
  });
});

describe("esCorreo / esUsuarioRepetido", () => {
  it("con «@» es correo; sin ella, usuario", () => {
    expect(esCorreo("a@b.pe")).toBe(true);
    expect(esCorreo("wfernandez")).toBe(false);
  });

  it("reconoce el choque del índice único y nada más", () => {
    expect(
      esUsuarioRepetido({ code: "23505", message: 'duplicate key value violates unique constraint "ux_perfiles_usuario"' }),
    ).toBe(true);
    expect(esUsuarioRepetido({ code: "23505", message: 'duplicate key "ux_perfiles_email"' })).toBe(false);
    expect(esUsuarioRepetido({ code: "23514", message: "perfiles_usuario_formato" })).toBe(false);
    expect(esUsuarioRepetido(null)).toBe(false);
  });
});
