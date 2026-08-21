/**
 * Único punto del paquete que habla por red con Decolecta. Nada fuera de
 * este archivo construye una URL de `api.decolecta.com` ni el header
 * `Authorization`. El token viaja SIEMPRE en el header, nunca en el
 * querystring (la propia documentación de Decolecta lo permite para el RUC
 * básico, pero queda en logs de servidor y proxies: prohibido aquí).
 *
 * Deliberadamente NO reintenta: cada reintento debe volver a pasar por el
 * guardián de cuota (cada intento cuesta cupo), así que la orquestación de
 * reintentos vive en `proveedor.ts`, no aquí.
 */

import { normalizarError, type ErrorConsulta } from "./errores";

export type PeticionFetch = typeof fetch;

export type RespuestaHttp<T> = { ok: true; datos: T } | { ok: false; error: ErrorConsulta };

export type OpcionesHttp = {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: PeticionFetch;
};

const BASE_URL_DEFECTO = "https://api.decolecta.com";
const TIMEOUT_DEFECTO_MS = 10_000;

export async function unaLlamadaHttp<T>(
  ruta: string,
  parametros: Record<string, string | undefined>,
  opciones: OpcionesHttp,
): Promise<RespuestaHttp<T>> {
  const base = opciones.baseUrl ?? BASE_URL_DEFECTO;
  const url = new URL(ruta, base);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) url.searchParams.set(clave, valor);
  }

  const fetchImpl = opciones.fetch ?? fetch;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_DEFECTO_MS;

  let respuesta: Response;
  try {
    respuesta = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opciones.token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const nombre = error instanceof Error ? error.name : undefined;
    const esTimeout = nombre === "TimeoutError";
    return {
      ok: false,
      error: {
        codigo: esTimeout ? "TIMEOUT" : "RED",
        httpStatus: null,
        mensaje: "No se pudo contactar al proveedor de consultas. Escribe los datos a mano.",
        mensajeCrudo: error instanceof Error ? error.message : String(error),
        reintentable: true,
        cacheable: false,
      },
    };
  }

  if (respuesta.ok) {
    const datos = (await respuesta.json()) as T;
    return { ok: true, datos };
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Cuerpo vacío o no-JSON: se normaliza igual, sin mensaje crudo.
  }
  return { ok: false, error: normalizarError(respuesta.status, cuerpo) };
}
