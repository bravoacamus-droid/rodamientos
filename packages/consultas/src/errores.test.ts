import { describe, expect, it } from "vitest";
import { normalizarError } from "./errores";

/**
 * La API mezcla `{ error }` (400 y el resto) con `{ message }` (422 del RUC
 * básico). El normalizador tiene que digerir ambas formas y clasificar cada
 * status en la familia correcta: reintentable o no, cacheable en negativo o no.
 */
describe("normalizarError", () => {
  it("400 -> PETICION_INVALIDA, no reintentable, cacheable", () => {
    const error = normalizarError(400, { error: "Invalid request" });
    expect(error.codigo).toBe("PETICION_INVALIDA");
    expect(error.reintentable).toBe(false);
    expect(error.cacheable).toBe(true);
    expect(error.mensajeCrudo).toBe("Invalid request");
  });

  it("422 (forma {message} del RUC básico) -> DOCUMENTO_INVALIDO, cacheable", () => {
    const error = normalizarError(422, { message: "ruc no valido" });
    expect(error.codigo).toBe("DOCUMENTO_INVALIDO");
    expect(error.httpStatus).toBe(422);
    expect(error.reintentable).toBe(false);
    expect(error.cacheable).toBe(true);
    expect(error.mensajeCrudo).toBe("ruc no valido");
  });

  it("404 -> NO_ENCONTRADO, cacheable", () => {
    const error = normalizarError(404, {});
    expect(error.codigo).toBe("NO_ENCONTRADO");
    expect(error.cacheable).toBe(true);
  });

  it("401 y 403 -> NO_AUTORIZADO, nunca cacheable", () => {
    expect(normalizarError(401, {}).codigo).toBe("NO_AUTORIZADO");
    expect(normalizarError(403, {}).codigo).toBe("NO_AUTORIZADO");
    expect(normalizarError(401, {}).cacheable).toBe(false);
  });

  it("402 -> PAGO_REQUERIDO", () => {
    expect(normalizarError(402, {}).codigo).toBe("PAGO_REQUERIDO");
  });

  it("429 -> CUOTA_PROVEEDOR_AGOTADA, no reintentable, nunca cacheable", () => {
    const error = normalizarError(429, {});
    expect(error.codigo).toBe("CUOTA_PROVEEDOR_AGOTADA");
    expect(error.reintentable).toBe(false);
    expect(error.cacheable).toBe(false);
  });

  it("5xx -> ERROR_PROVEEDOR, reintentable, nunca cacheable", () => {
    const error500 = normalizarError(500, {});
    const error503 = normalizarError(503, {});
    expect(error500.codigo).toBe("ERROR_PROVEEDOR");
    expect(error500.reintentable).toBe(true);
    expect(error500.cacheable).toBe(false);
    expect(error503.reintentable).toBe(true);
  });

  it("status inesperado -> ERROR_PROVEEDOR, no reintentable", () => {
    const error = normalizarError(418, {});
    expect(error.codigo).toBe("ERROR_PROVEEDOR");
    expect(error.reintentable).toBe(false);
  });

  it("cuerpo vacío o no-JSON no revienta el normalizador", () => {
    expect(() => normalizarError(400, null)).not.toThrow();
    expect(() => normalizarError(400, "texto plano")).not.toThrow();
    expect(normalizarError(400, null).mensajeCrudo).toBeNull();
  });
});
