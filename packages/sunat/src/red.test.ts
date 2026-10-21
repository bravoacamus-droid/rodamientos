import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultadoCdr } from "./dominio/index";
import {
  ErrorRedSunat,
  MENSAJE_1033_SIN_CONFIRMAR,
  MENSAJE_RESPUESTA_INCIERTA,
  MENSAJE_SIN_CONEXION,
  decidirEnvio,
  esErrorDeRed,
  hayQueConsultarAntesDeRechazar,
  mensajeParaPersona,
  pedirConLimite,
} from "./red";

const cdr = (codigo: string, aceptado: boolean, observaciones: string[] = []): ResultadoCdr => ({
  aceptado,
  codigo,
  descripcion: aceptado ? "La Factura numero F001-1, ha sido aceptada" : `Error ${codigo}`,
  observaciones,
});

describe("esErrorDeRed", () => {
  it("reconoce los cortes de Node y undici", () => {
    expect(esErrorDeRed(new TypeError("fetch failed"))).toBe(true);
    const conCausa = new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) });
    expect(esErrorDeRed(conCausa)).toBe(true);
    expect(esErrorDeRed(Object.assign(new Error("connect"), { code: "ETIMEDOUT" }))).toBe(true);
    expect(esErrorDeRed(new ErrorRedSunat("tiempo", "x"))).toBe(true);
  });

  it("reconoce el tiempo agotado", () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    expect(esErrorDeRed(e)).toBe(true);
  });

  it("no confunde un error de verdad con un corte", () => {
    expect(esErrorDeRed(new Error("El certificado no se pudo leer"))).toBe(false);
    expect(esErrorDeRed(new Error("SUNAT: la red de distribución no es válida"))).toBe(false);
    expect(esErrorDeRed("fetch failed")).toBe(false);
  });
});

describe("mensajeParaPersona", () => {
  it("traduce lo técnico guardado antes", () => {
    expect(mensajeParaPersona("fetch failed")).toBe(MENSAJE_SIN_CONEXION);
    expect(mensajeParaPersona("connect ECONNREFUSED 1.2.3.4:443")).toBe(MENSAJE_SIN_CONEXION);
  });

  it("deja tal cual lo que dice SUNAT", () => {
    expect(mensajeParaPersona("2800 - El dato ingresado en el tipo de documento no es válido")).toBe(
      "2800 - El dato ingresado en el tipo de documento no es válido",
    );
    expect(mensajeParaPersona(null)).toBeNull();
  });
});

describe("pedirConLimite", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("un corte sale como ErrorRedSunat con el mensaje humano", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(pedirConLimite("https://x", {}, 1000)).rejects.toMatchObject({
      name: "ErrorRedSunat",
      causa: "conexion",
      message: MENSAJE_SIN_CONEXION,
    });
  });

  it("el tiempo agotado se marca como tal", async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(e));
    await expect(pedirConLimite("https://x", {}, 1000)).rejects.toMatchObject({ causa: "tiempo" });
  });

  it("pasa el plazo como señal y devuelve el cuerpo", async () => {
    const f = vi.fn().mockResolvedValue(new Response("hola", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await pedirConLimite("https://x", { method: "POST" }, 1000);
    expect(r).toEqual({ status: 200, ok: true, texto: "hola" });
    expect(f.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("hayQueConsultarAntesDeRechazar", () => {
  it("solo un 1033 sobre algo que ya se había mandado", () => {
    expect(hayQueConsultarAntesDeRechazar(cdr("soap-env:Client.1033", false), true)).toBe(true);
    expect(hayQueConsultarAntesDeRechazar(cdr("1033", false), false)).toBe(false);
    expect(hayQueConsultarAntesDeRechazar(cdr("2800", false), true)).toBe(false);
    expect(hayQueConsultarAntesDeRechazar(cdr("0", true), true)).toBe(false);
  });
});

describe("decidirEnvio", () => {
  it("un CDR normal manda", () => {
    expect(decidirEnvio(cdr("0", true), false)).toMatchObject({ estado: "aceptado" });
    expect(decidirEnvio(cdr("4252", true, ["obs"]), false)).toMatchObject({ estado: "observado" });
    expect(decidirEnvio(cdr("2800", false), true)).toMatchObject({ estado: "rechazado" });
  });

  it("un 1033 a la primera es otro documento con ese número: rechazado", () => {
    expect(decidirEnvio(cdr("1033", false), false)).toMatchObject({ estado: "rechazado" });
  });

  it("un 1033 tras un corte, y SUNAT tiene su constancia aceptada: aceptado, sin emitir otro", () => {
    const d = decidirEnvio(cdr("1033", false), true, { cdr: cdr("0", true) });
    expect(d).toMatchObject({ estado: "aceptado" });
  });

  it("un 1033 tras un corte, y la constancia es un rechazo: rechazado con ese código", () => {
    const d = decidirEnvio(cdr("1033", false), true, { cdr: cdr("2335", false) });
    expect(d.estado).toBe("rechazado");
    expect(d.estado !== "pendiente" && d.cdr.codigo).toBe("2335");
  });

  it("un 1033 tras un corte sin poder confirmar: pendiente, NUNCA «emite otro»", () => {
    expect(decidirEnvio(cdr("1033", false), true, { sinCdr: "beta" })).toEqual({
      estado: "pendiente",
      mensaje: MENSAJE_1033_SIN_CONFIRMAR,
    });
    expect(decidirEnvio(cdr("1033", false), true, null)).toEqual({
      estado: "pendiente",
      mensaje: MENSAJE_1033_SIN_CONFIRMAR,
    });
  });

  it("sin respuesta de SUNAT no se marca rechazado", () => {
    expect(decidirEnvio(cdr("sin_respuesta", false), false)).toEqual({
      estado: "pendiente",
      mensaje: MENSAJE_RESPUESTA_INCIERTA,
    });
    expect(decidirEnvio(cdr("sin_conexion", false), true)).toMatchObject({ estado: "pendiente" });
  });
});
