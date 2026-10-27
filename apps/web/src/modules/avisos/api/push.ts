import "server-only";

import webpush from "web-push";
import { envOpcional } from "@rodatech/config";

import { esCodigoDeBaja, type Notificacion } from "../dominio/envio";

/**
 * La parte de Web Push que toca la red. Solo servidor: la clave privada VAPID
 * firma cada envío y no puede salir de aquí.
 *
 * Tres variables (ver `.env.example`): la pública, que también la usa el
 * navegador para suscribirse; la privada; y el `mailto:` de contacto que los
 * servicios de push exigen por si el envío les da problemas.
 */

let configurado: boolean | null = null;

/** ¿Están las claves? Sin ellas no se ofrece el botón ni se intenta mandar nada. */
export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const publica = envOpcional("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privada = envOpcional("VAPID_PRIVATE_KEY");
  const contacto = envOpcional("VAPID_SUBJECT") ?? "mailto:avisos@rodatechperu.com";
  if (!publica || !privada) return (configurado = false);
  webpush.setVapidDetails(contacto, publica, privada);
  return (configurado = true);
}

export interface AparatoDestino {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** El aparato ya no existe (404/410): no tiene sentido reintentar. */
  definitivo: boolean;
  error: string | null;
}

/** Lo que cabe: el servicio de push corta en 4 KB, y un aviso no necesita más de dos líneas. */
function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export async function mandar(aparato: AparatoDestino, n: Notificacion): Promise<ResultadoEnvio> {
  if (!pushConfigurado()) {
    return { ok: false, definitivo: false, error: "Faltan las claves de avisos (VAPID) en el servidor." };
  }
  const cuerpo = JSON.stringify({
    titulo: recortar(n.titulo, 120),
    cuerpo: recortar(n.cuerpo, 300),
    url: n.url,
    etiqueta: n.etiqueta,
    urgente: n.urgente,
  });
  try {
    await webpush.sendNotification(
      { endpoint: aparato.endpoint, keys: { p256dh: aparato.p256dh, auth: aparato.auth } },
      cuerpo,
      {
        // Un aviso de stock de hace dos días ya no es un aviso: si el
        // celular estuvo apagado más de un día, que no le llegue.
        TTL: 60 * 60 * 24,
        urgency: n.urgente ? "high" : "normal",
        timeout: 10_000,
      },
    );
    return { ok: true, definitivo: false, error: null };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    const texto = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      definitivo: esCodigoDeBaja(status),
      error: recortar(status ? `${status} · ${texto}` : texto, 400),
    };
  }
}
