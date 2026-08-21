import { describe, expect, it, vi } from "vitest";
import { consultarDni, dniValido } from "./dni";
import { ClienteSupabaseFalso, crearContextoPrueba, respuestaFalsa } from "./soporte-pruebas";

describe("dniValido", () => {
  it("acepta exactamente 8 dígitos", () => {
    expect(dniValido("46027897")).toBe(true);
  });

  it("rechaza longitudes distintas y no numéricos", () => {
    expect(dniValido("4602789")).toBe(false); // 7 dígitos
    expect(dniValido("460278970")).toBe(false); // 9 dígitos
    expect(dniValido("4602789a")).toBe(false);
    expect(dniValido("")).toBe(false);
  });
});

describe("consultarDni", () => {
  it("un DNI inválido no toca caché, cuota ni red", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchEspia = vi.fn();
    const contexto = crearContextoPrueba({ cliente, fetch: fetchEspia as unknown as typeof fetch });

    const resultado = await consultarDni("123", contexto);
    expect(resultado.ok).toBe(false);
    expect(resultado.errorCodigo).toBe("VALIDACION_LOCAL");
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(cliente.llamadasRpc).toHaveLength(0);
  });

  it("normaliza la respuesta de RENIEC y reconstruye full_name si falta", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () =>
      respuestaFalsa(200, {
        first_name: "ROXANA KARINA",
        first_last_name: "DELGADO",
        second_last_name: "HUAMANI",
        document_number: "46027897",
        // sin full_name a propósito
      }),
    );
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    const resultado = await consultarDni("46027897", contexto);
    expect(resultado.ok).toBe(true);
    expect(resultado.datos?.nombreCompleto).toBe("DELGADO HUAMANI ROXANA KARINA");
  });

  it("no se escribe el número de documento en el log de observabilidad", async () => {
    const cliente = new ClienteSupabaseFalso();
    const fetchFalso = vi.fn(async () =>
      respuestaFalsa(200, { first_name: "X", first_last_name: "Y", second_last_name: "Z", document_number: "46027897" }),
    );
    const contexto = crearContextoPrueba({ cliente, fetch: fetchFalso as unknown as typeof fetch });

    await consultarDni("46027897", contexto);
    expect(cliente.logs).toHaveLength(1);
    const entrada = JSON.stringify(cliente.logs[0]);
    expect(entrada).not.toContain("46027897");
  });
});
