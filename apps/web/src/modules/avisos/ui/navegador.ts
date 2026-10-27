/**
 * Lo que el navegador permite, y la suscripción. Solo corre en el navegador.
 *
 * iPhone es el caso raro y conviene tenerlo claro: Safari solo deja recibir
 * avisos a una página «añadida a pantalla de inicio» (iOS 16.4 o más). Abierta
 * en una pestaña normal, `PushManager` ni existe. Por eso se mira antes que
 * nada, y se explica, en vez de decir «no compatible» a un iPhone que sí lo es.
 */

export type EstadoNavegador =
  /** Se puede pedir permiso: el navegador todavía no ha preguntado. */
  | "listo"
  /** Ya dio permiso alguna vez. */
  | "concedido"
  /** Lo bloqueó: solo se arregla desde los ajustes del navegador. */
  | "bloqueado"
  /** iPhone o iPad en una pestaña de Safari: hay que añadirlo a la pantalla de inicio. */
  | "ios-instalar"
  | "no-compatible";

export const RUTA_SW = "/sw.js";

function esIos(): boolean {
  const ua = navigator.userAgent;
  // El iPad con iPadOS 13+ se presenta como Mac; se le reconoce por la pantalla táctil.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function instaladaEnInicio(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function estadoDelNavegador(): EstadoNavegador {
  if (typeof window === "undefined") return "no-compatible";
  const tieneTodo = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (esIos() && !instaladaEnInicio()) return "ios-instalar";
  if (!tieneTodo) return "no-compatible";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission === "granted") return "concedido";
  return "listo";
}

export interface SuscripcionPlana {
  endpoint: string;
  p256dh: string;
  auth: string;
  agente: string;
}

async function registro(): Promise<ServiceWorkerRegistration> {
  const r = await navigator.serviceWorker.register(RUTA_SW, { scope: "/" });
  await navigator.serviceWorker.ready;
  return r;
}

function plana(s: PushSubscription): SuscripcionPlana | null {
  const j = s.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, agente: navigator.userAgent };
}

/** La suscripción que ya tenga este navegador, si tiene. */
export async function suscripcionActual(): Promise<(SuscripcionPlana & { cancelar: () => Promise<boolean> }) | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const r = await registro();
    const s = await r.pushManager.getSubscription();
    if (!s) return null;
    const p = plana(s);
    return p ? { ...p, cancelar: () => s.unsubscribe() } : null;
  } catch {
    return null;
  }
}

/** La clave pública VAPID viene en base64 «de URL»; el navegador la quiere en bytes. */
function bytesDeClave(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const salida = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) salida[i] = b.charCodeAt(i);
  return salida;
}

export async function suscribir(
  clavePublica: string,
): Promise<{ ok: true; suscripcion: SuscripcionPlana } | { ok: false; error: string }> {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso === "denied") {
      return { ok: false, error: "Has bloqueado los avisos. Mira abajo cómo desbloquearlos." };
    }
    if (permiso !== "granted") {
      return { ok: false, error: "No se activaron: hay que contestar «Permitir» cuando el navegador pregunte." };
    }
    const r = await registro();
    const s =
      (await r.pushManager.getSubscription()) ??
      (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeClave(clavePublica) }));
    const p = plana(s);
    if (!p) return { ok: false, error: "El navegador no devolvió una suscripción completa." };
    return { ok: true, suscripcion: p };
  } catch (e) {
    return { ok: false, error: `El navegador no dejó activar los avisos: ${e instanceof Error ? e.message : String(e)}` };
  }
}
