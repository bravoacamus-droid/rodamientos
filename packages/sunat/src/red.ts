/**
 * Cuando SUNAT no contesta (auditoría 21/10, A4).
 *
 * El camino que acababa en una factura DOBLE era este: SUNAT acepta, la
 * respuesta se pierde por el camino (o la función agota su tiempo), el
 * comprobante vuelve a «pendiente», se reenvía, SUNAT contesta 1033 —«ya está
 * registrado»— y la pantalla decía «emite uno NUEVO». El cliente acababa con
 * dos facturas por la misma venta.
 *
 * Aquí viven las tres piezas que lo cortan, sin dependencias de Node para que
 * la pantalla también las pueda usar:
 *
 *   · un fallo de RED se reconoce como tal, y se dice en cristiano;
 *   · un 1033 sobre un comprobante que ya se había mandado NO es «emite
 *     otro»: es «quizá ya lo tiene», y se pregunta a SUNAT antes de decidir;
 *   · si no se puede preguntar, el comprobante queda pendiente y avisado,
 *     nunca rechazado.
 */
import type { ResultadoCdr } from "./dominio/index";

/** Lo que lee quien vende cuando no hubo conexión. Sin «fetch failed». */
export const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con SUNAT (sin internet o SUNAT caído). Sigue pendiente: vuelve a intentarlo en unos minutos.";

/** SUNAT contestó algo que no es una respuesta: ni CDR ni rechazo. */
export const MENSAJE_RESPUESTA_INCIERTA =
  "SUNAT no dio una respuesta clara. Sigue pendiente: vuelve a intentarlo en unos minutos. Si ya lo habías mandado antes, no emitas otro.";

/** Un 1033 sobre algo que ya se mandó, y SUNAT no deja confirmar qué tiene. */
export const MENSAJE_1033_SIN_CONFIRMAR =
  "SUNAT dice que ese número ya lo tiene registrado, y este comprobante ya se había mandado antes: lo más probable es que sea este mismo. NO emitas otro. Compruébalo en el portal de SUNAT (Consulta de validez del comprobante) y vuelve a intentar enviarlo más tarde.";

/** Un fallo del viaje, no de SUNAT: se agotó el tiempo o no hubo conexión. */
export class ErrorRedSunat extends Error {
  constructor(
    readonly causa: "tiempo" | "conexion",
    /** El error técnico original, para el registro; nunca para la pantalla. */
    readonly detalle: string,
  ) {
    super(MENSAJE_SIN_CONEXION);
    this.name = "ErrorRedSunat";
  }
}

/**
 * Los textos con los que Node y undici dicen «no llegué». Solo tokens
 * técnicos: un mensaje de SUNAT que diga «tiempo» o «red» no debe confundirse
 * con un corte.
 */
const PATRON_RED =
  /fetch failed|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|socket hang up|UND_ERR_[A-Z_]+|other side closed|operation was aborted|due to timeout/i;

/** ¿Es un fallo de red (o de tiempo), y no una respuesta de SUNAT? */
export function esErrorDeRed(e: unknown): boolean {
  if (e instanceof ErrorRedSunat) return true;
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  const causa = (e as { cause?: unknown }).cause;
  const textos = [
    e.message,
    (e as { code?: unknown }).code,
    causa instanceof Error ? causa.message : causa,
    (causa as { code?: unknown } | undefined)?.code,
  ];
  return textos.some((t) => typeof t === "string" && PATRON_RED.test(t));
}

/**
 * Un mensaje guardado, listo para la pantalla. Los cortes de red que se
 * guardaron en crudo antes de esto («fetch failed») se traducen al leerlos.
 */
export function mensajeParaPersona(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return PATRON_RED.test(texto) ? MENSAJE_SIN_CONEXION : texto;
}

/**
 * `fetch` con tiempo límite, leyendo el cuerpo dentro del mismo plazo.
 *
 * Sin límite, si SUNAT se colgaba la acción esperaba hasta que la plataforma
 * la mataba, y el comprobante se quedaba «enviado» quince minutos sin que
 * nadie supiera por qué. Cualquier corte sale como {@link ErrorRedSunat}.
 */
export async function pedirConLimite(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<{ status: number; ok: boolean; texto: string }> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    const texto = await r.text();
    return { status: r.status, ok: r.ok, texto };
  } catch (e) {
    if (esErrorDeRed(e)) {
      const nombre = e instanceof Error ? e.name : "";
      throw new ErrorRedSunat(
        nombre === "TimeoutError" || nombre === "AbortError" ? "tiempo" : "conexion",
        e instanceof Error ? e.message : String(e),
      );
    }
    throw e;
  }
}

/** Plazos. Enviar puede tardar (SUNAT valida el XML); el token, no. */
export const PLAZO_ENVIO_MS = 25_000;
export const PLAZO_CONSULTA_MS = 15_000;
export const PLAZO_TOKEN_MS = 10_000;

/** El número de un código de SUNAT: «soap-env:Client.1033» → «1033». */
function numeroDeCodigo(codigo: string | null | undefined): string {
  return String(codigo ?? "").match(/(\d{3,4})(?!.*\d)/)?.[1] ?? "";
}

/**
 * Faltas de nuestro transporte, no de SUNAT: no hubo respuesta, o vino sin
 * CDR. No dicen nada del comprobante, así que no pueden marcarlo rechazado.
 */
export function esRespuestaIncierta(codigo: string | null | undefined): boolean {
  return codigo === "sin_conexion" || codigo === "sin_respuesta";
}

/**
 * ¿Hay que preguntar a SUNAT antes de creerse este rechazo?
 *
 * Solo un 1033 («registrado previamente») y solo si el comprobante ya había
 * salido antes: entonces lo más probable es que lo registrado sea ESTE mismo,
 * aceptado en un intento cuya respuesta se perdió. Un 1033 a la primera sí es
 * otro documento con ese número —el caso del 04/08— y vale lo de siempre.
 */
export function hayQueConsultarAntesDeRechazar(
  cdr: Pick<ResultadoCdr, "aceptado" | "codigo">,
  yaSeHabiaMandado: boolean,
): boolean {
  return !cdr.aceptado && yaSeHabiaMandado && numeroDeCodigo(cdr.codigo) === "1033";
}

/** Lo que contestó la consulta del CDR (getStatusCdr). */
export type ResultadoConsultaCdr =
  /** SUNAT tiene el comprobante y devolvió su constancia. */
  | { cdr: ResultadoCdr }
  /** No devolvió constancia: no existe, o no se pudo preguntar (beta, permisos). */
  | { sinCdr: string };

/** Cómo queda el comprobante tras enviar (y, si hizo falta, consultar). */
export type Decision =
  | { estado: "aceptado" | "observado" | "rechazado"; cdr: ResultadoCdr }
  | { estado: "pendiente"; mensaje: string };

/** El estado que corresponde a un CDR. */
export function estadoDeCdr(cdr: ResultadoCdr): "aceptado" | "observado" | "rechazado" {
  if (!cdr.aceptado) return "rechazado";
  return cdr.observaciones.length > 0 ? "observado" : "aceptado";
}

/**
 * Decide en qué queda un envío. Pura: el transporte va fuera.
 *
 * @param consulta lo que dijo getStatusCdr, si se le preguntó; `null` si se
 *   intentó y no hubo forma (red caída), `undefined` si no hacía falta.
 */
export function decidirEnvio(
  cdr: ResultadoCdr,
  yaSeHabiaMandado: boolean,
  consulta?: ResultadoConsultaCdr | null,
): Decision {
  if (!cdr.aceptado && esRespuestaIncierta(cdr.codigo)) {
    return { estado: "pendiente", mensaje: MENSAJE_RESPUESTA_INCIERTA };
  }
  if (!hayQueConsultarAntesDeRechazar(cdr, yaSeHabiaMandado)) {
    return { estado: estadoDeCdr(cdr), cdr };
  }
  // Un 1033 sobre algo que ya salió: manda lo que SUNAT tiene registrado.
  if (consulta && "cdr" in consulta) {
    return { estado: estadoDeCdr(consulta.cdr), cdr: consulta.cdr };
  }
  return { estado: "pendiente", mensaje: MENSAJE_1033_SIN_CONFIRMAR };
}
