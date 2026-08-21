import { describe, expect, it, vi } from "vitest";
import { tipoCambioSunat } from "./tipo-cambio";
import { ClienteSupabaseFalso, crearContextoPrueba, respuestaFalsa } from "./soporte-pruebas";

describe("tipoCambioSunat — validación local", () => {
  it("rechaza una fecha futura sin salir a la red", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchEspia = vi.fn();
    const contexto = crearContextoPrueba({ cliente, fetch: fetchEspia as unknown as typeof fetch });

    const resultado = await tipoCambioSunat({ fecha: "2099-01-01" }, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("VALIDACION_LOCAL");
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it("rechaza un mes fuera de rango", async () => {
    const cliente = new ClienteSupabaseFalso();
    const contexto = crearContextoPrueba({ cliente });
    const resultado = await tipoCambioSunat({ mes: 13, anio: 2025 }, contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("VALIDACION_LOCAL");
  });
});

describe("tipoCambioSunat — normalización", () => {
  it("mantiene los precios como string y normaliza el arreglo", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () =>
      respuestaFalsa(200, [
        { buy_price: "3.540", sell_price: "3.552", base_currency: "USD", quote_currency: "PEN", date: "2025-07-26" },
      ]),
    );
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    const resultado = await tipoCambioSunat({ fecha: "2025-07-26" }, contexto);
    expect(resultado.ok).toBe(true);
    expect(resultado.datos?.[0]?.compra).toBe("3.540");
    expect(typeof resultado.datos?.[0]?.compra).toBe("string");
    expect(resultado.datos?.[0]?.venta).toBe("3.552");
  });

  it("una fecha pasada se cachea de forma permanente (expira_en null)", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () =>
      respuestaFalsa(200, [
        { buy_price: "3.540", sell_price: "3.552", base_currency: "USD", quote_currency: "PEN", date: "2025-07-26" },
      ]),
    );
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    await tipoCambioSunat({ fecha: "2025-07-26" }, contexto);
    const segundo = await tipoCambioSunat({ fecha: "2025-07-26" }, contexto);
    expect(segundo.origen).toBe("cache");
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
