import { describe, expect, it, vi } from "vitest";
import { escribirCache, leerCache, unaSolaVez } from "./cache";
import { ClienteSupabaseFalso } from "./soporte-pruebas";

describe("leerCache / escribirCache", () => {
  it("una clave nunca escrita vuelve 'vacio'", async () => {
    const cliente = new ClienteSupabaseFalso();
    const resultado = await leerCache(cliente, "ruc", "20601030013");
    expect(resultado.estado).toBe("vacio");
  });

  it("ttlMs null hace la entrada permanente (vigente para siempre)", async () => {
    const cliente = new ClienteSupabaseFalso();
    await escribirCache(cliente, "tipo_cambio", "fecha:2020-01-01", true, { venta: "3.5" }, null);
    const resultado = await leerCache(cliente, "tipo_cambio", "fecha:2020-01-01");
    expect(resultado.estado).toBe("vigente");
  });

  it("una entrada vencida se reporta como 'rancio', no 'vigente'", async () => {
    const cliente = new ClienteSupabaseFalso();
    await escribirCache(cliente, "ruc", "20601030013", true, { razon_social: "X" }, -1000); // ya vencida
    const resultado = await leerCache(cliente, "ruc", "20601030013");
    expect(resultado.estado).toBe("rancio");
  });

  it("una entrada negativa vencida se reporta como 'vacio' (permite reintentar)", async () => {
    const cliente = new ClienteSupabaseFalso();
    await escribirCache(cliente, "ruc", "10000000000", false, null, -1000);
    const resultado = await leerCache(cliente, "ruc", "10000000000");
    expect(resultado.estado).toBe("vacio");
  });
});

describe("unaSolaVez — deduplicación single-flight", () => {
  it("dos llamadas simultáneas con la misma clave ejecutan la tarea una sola vez", async () => {
    const tarea = vi.fn(async () => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      return "resultado";
    });

    const [a, b] = await Promise.all([unaSolaVez("misma-clave", tarea), unaSolaVez("misma-clave", tarea)]);

    expect(tarea).toHaveBeenCalledTimes(1);
    expect(a).toBe("resultado");
    expect(b).toBe("resultado");
  });

  it("claves distintas ejecutan la tarea por separado", async () => {
    const tarea = vi.fn(async () => "x");
    await Promise.all([unaSolaVez("clave-a", tarea), unaSolaVez("clave-b", tarea)]);
    expect(tarea).toHaveBeenCalledTimes(2);
  });

  it("tras resolverse, una nueva llamada con la misma clave vuelve a ejecutar la tarea", async () => {
    const tarea = vi.fn(async () => "x");
    await unaSolaVez("clave-c", tarea);
    await unaSolaVez("clave-c", tarea);
    expect(tarea).toHaveBeenCalledTimes(2);
  });
});
