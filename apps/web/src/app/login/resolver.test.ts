import { describe, expect, it, vi } from "vitest";

import { resolverCuenta } from "./resolver";

const directorio: Record<string, string> = { wfernandez: "WFernandez@RodatechPeru.com" };
const buscar = vi.fn(async (u: string) => directorio[u] ?? null);

describe("resolverCuenta (171)", () => {
  it("un correo va tal cual y no consulta el directorio", async () => {
    buscar.mockClear();
    const r = await resolverCuenta(" Willy@Rodatech.pe ", buscar);
    expect(r).toEqual({ correo: "willy@rodatech.pe", claveLimite: "willy@rodatech.pe" });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("un usuario se traduce a su correo, y el límite cuenta por ESE correo", async () => {
    const porUsuario = await resolverCuenta("WFernandez", buscar);
    const porCorreo = await resolverCuenta("wfernandez@rodatechperu.com", buscar);
    expect(porUsuario.correo).toBe("wfernandez@rodatechperu.com");
    // La misma clave por los dos caminos: alternarlos no da más intentos.
    expect(porUsuario.claveLimite).toBe(porCorreo.claveLimite);
  });

  it("un usuario que no existe no da correo, y se cuenta aparte sin chocar con ninguno", async () => {
    const r = await resolverCuenta("noexiste", buscar);
    expect(r.correo).toBeNull();
    expect(r.claveLimite).toBe("usuario:noexiste");
    expect(r.claveLimite).not.toContain("@");
  });

  it("si la búsqueda falla, es como si no existiera", async () => {
    const r = await resolverCuenta("wfernandez", async () => {
      throw new Error("sin red");
    });
    expect(r.correo).toBeNull();
  });
});
