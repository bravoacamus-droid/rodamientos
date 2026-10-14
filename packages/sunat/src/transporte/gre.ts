/**
 * Transporte de la guía de remisión electrónica (GRE): REST con OAuth2.
 *
 * Desde la RS 000108-2026/SUNAT la guía no va por el billService SOAP de la
 * factura: se pide un token, se manda el ZIP con su hash y SUNAT devuelve un
 * TICKET; el CDR se pregunta después con ese ticket. Todo lo de aquí está
 * contrastado en `docs/INVESTIGACION-GRE.md` contra el manual de SUNAT y el
 * `openapi.yaml` de `thegreenter/gre-api`.
 *
 * Las URL son configurables a propósito: no hay ambiente de pruebas oficial,
 * y para probar sin gastar correlativos reales se apunta a un emulador. La
 * app solo lo permite en beta y con credenciales PROPIAS del emulador
 * (`modoGuias`): nunca se mandan las reales a un tercero.
 */
import { createHash } from "node:crypto";

import { RUTAS_GRE } from "./endpoints";

export interface CredencialesGre {
  /** «ID» que da SUNAT al registrar la aplicación en «Credenciales de API SUNAT». */
  clientId: string;
  /** Su «CLAVE». */
  clientSecret: string;
  /** RUC + usuario SOL secundario, p. ej. 20562681206MODDATOS. */
  usuarioSol: string;
  claveSol: string;
  /** Para apuntar a un emulador; por defecto, SUNAT. */
  urlToken?: string;
  hostEnvio?: string;
}

/** Un error de SUNAT dicho en una frase, con su código si lo trae. */
export class ErrorGre extends Error {
  constructor(
    mensaje: string,
    readonly codigo: string | null,
    readonly http: number | null,
  ) {
    super(mensaje);
    this.name = "ErrorGre";
  }
}

/*
  El token dura una hora. Se guarda en memoria por credencial y se renueva un
  rato antes: pedir uno por guía es lo que hace que SUNAT corte por exceso.
*/
const tokens = new Map<string, { token: string; vence: number }>();

/** Lo que dice un cuerpo de error de SUNAT, en cualquiera de sus dos formas. */
function mensajeDeError(cuerpo: unknown, http: number): { mensaje: string; codigo: string | null } {
  const c = (cuerpo ?? {}) as {
    cod?: string;
    msg?: string;
    error?: string;
    error_description?: string;
    errors?: { cod?: string; msg?: string; codError?: string; desError?: string }[];
  };
  const primero = c.errors?.[0];
  if (primero) {
    return {
      mensaje: primero.desError ?? primero.msg ?? c.msg ?? `Error ${http}`,
      codigo: primero.codError ?? primero.cod ?? c.cod ?? null,
    };
  }
  return {
    mensaje: c.msg ?? c.error_description ?? c.error ?? `SUNAT respondió ${http}`,
    codigo: c.cod ?? (c.error ? String(c.error) : null),
  };
}

/**
 * El cuerpo como JSON, o null. Un cuerpo que no es JSON NO se repite: si un
 * proxy delante del token devolviera el formulario enviado, ese texto lleva
 * el client_secret y la clave SOL, y acabaría en pantalla (auditoría 15/10).
 */
async function leerJson(r: Response): Promise<unknown> {
  const texto = await r.text();
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/** Pide (o reutiliza) el token OAuth2 de la GRE. */
export async function tokenGre(c: CredencialesGre, ahora = Date.now()): Promise<string> {
  const clave = `${c.clientId}|${c.usuarioSol}`;
  const guardado = tokens.get(clave);
  if (guardado && guardado.vence > ahora) return guardado.token;

  const url = (c.urlToken ?? RUTAS_GRE.token).replace("{client_id}", encodeURIComponent(c.clientId));
  // form-urlencoded: el manual dice «Application/json» en la cabecera, pero el
  // cuerpo que describe es de formulario, y es lo que funciona en producción.
  const cuerpo = new URLSearchParams({
    grant_type: "password",
    scope: "https://api-cpe.sunat.gob.pe",
    client_id: c.clientId,
    client_secret: c.clientSecret,
    username: c.usuarioSol,
    password: c.claveSol,
  });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo.toString(),
  });
  const datos = (await leerJson(r)) as { access_token?: string; expires_in?: number } | null;
  if (!r.ok || !datos?.access_token) {
    const e = mensajeDeError(datos, r.status);
    throw new ErrorGre(`SUNAT no dio acceso para guías: ${e.mensaje}`, e.codigo, r.status);
  }
  const segundos = Number(datos.expires_in) > 0 ? Number(datos.expires_in) : 3600;
  // Cinco minutos de margen: un token que vence a mitad de envío es un 401.
  tokens.set(clave, { token: datos.access_token, vence: ahora + Math.max(segundos - 300, 60) * 1000 });
  return datos.access_token;
}

/** Olvida el token guardado (tras un 401, para pedir otro). */
export function olvidarTokenGre(c: Pick<CredencialesGre, "clientId" | "usuarioSol">): void {
  tokens.delete(`${c.clientId}|${c.usuarioSol}`);
}

/** El hash que SUNAT pide del ZIP: SHA-256 de sus bytes, en hexadecimal. */
export function hashZip(zipB64: string): string {
  return createHash("sha256").update(Buffer.from(zipB64, "base64")).digest("hex");
}

/**
 * Manda el ZIP de una guía. Devuelve el ticket; el resultado se pregunta con
 * {@link consultarTicketGre}. `nombre` va SIN extensión (RUC-09-SERIE-NÚMERO).
 */
export async function enviarGre(c: CredencialesGre, nombre: string, zipB64: string): Promise<string> {
  const host = c.hostEnvio ?? RUTAS_GRE.hostEnvio;
  const url = host + RUTAS_GRE.enviar.replace("{filename}", encodeURIComponent(nombre));
  const intentar = async () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenGre(c)}` },
      body: JSON.stringify({
        archivo: { nomArchivo: `${nombre}.zip`, arcGreZip: zipB64, hashZip: hashZip(zipB64) },
      }),
    });

  let r = await intentar();
  if (r.status === 401) {
    olvidarTokenGre(c);
    r = await intentar();
  }
  const datos = (await leerJson(r)) as { numTicket?: string } | null;
  if (!r.ok || !datos?.numTicket) {
    const e = mensajeDeError(datos, r.status);
    throw new ErrorGre(e.mensaje, e.codigo, r.status);
  }
  return datos.numTicket;
}

export type EstadoTicketGre =
  | { estado: "en_proceso" }
  /** `cdr` es el base64 tal cual llega: ZIP o XML, lo decide quien lo lee. */
  | { estado: "procesado"; cdr: string | null }
  | { estado: "error"; codigo: string | null; mensaje: string; cdr: string | null };

/** Pregunta cómo quedó un envío por su ticket (98 en proceso, 0 listo, 99 error). */
export async function consultarTicketGre(c: CredencialesGre, ticket: string): Promise<EstadoTicketGre> {
  const host = c.hostEnvio ?? RUTAS_GRE.hostEnvio;
  const url = host + RUTAS_GRE.consultarTicket.replace("{numTicket}", encodeURIComponent(ticket));
  const intentar = async () => fetch(url, { headers: { Authorization: `Bearer ${await tokenGre(c)}` } });

  let r = await intentar();
  if (r.status === 401) {
    olvidarTokenGre(c);
    r = await intentar();
  }
  const datos = (await leerJson(r)) as {
    codRespuesta?: string;
    arcCdr?: string;
    error?: { numError?: string; desError?: string };
  } | null;
  if (!r.ok || !datos) {
    const e = mensajeDeError(datos, r.status);
    throw new ErrorGre(e.mensaje, e.codigo, r.status);
  }
  const cod = String(datos.codRespuesta ?? "");
  if (cod === "98") return { estado: "en_proceso" };
  if (cod === "0") return { estado: "procesado", cdr: datos.arcCdr ?? null };
  return {
    estado: "error",
    codigo: datos.error?.numError ?? cod ?? null,
    mensaje: datos.error?.desError ?? "SUNAT no aceptó la guía.",
    cdr: datos.arcCdr ?? null,
  };
}
