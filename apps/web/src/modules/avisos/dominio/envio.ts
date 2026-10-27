/**
 * Qué notificaciones salen hacia cada aparato. Lógica pura: sin red, sin base,
 * sin reloj.
 *
 * Willy, en la reunión que originó las alertas: *«pero no te llega como una
 * alerta, tú tienes que entrar y ver»* (25:21). La tabla `alertas` es la cola;
 * esto decide cómo se vacía (162).
 *
 * La regla del resumen sale de cómo se usa un celular: tres avisos sueltos se
 * leen en la pantalla bloqueada; siete tapan todo lo demás y acaban
 * silenciados. Con más de `MAXIMO_SUELTAS` sale UNO que dice cuántos son y
 * abre la bandeja entera.
 */

export type Severidad = "info" | "baja" | "media" | "alta" | "critica";

/** El orden del enum `severidad_alerta` de la base, de menos a más. */
export const ORDEN_SEVERIDAD: Record<Severidad, number> = {
  info: 0,
  baja: 1,
  media: 2,
  alta: 3,
  critica: 4,
};

export const SEVERIDADES: readonly Severidad[] = ["info", "baja", "media", "alta", "critica"];

/** Por encima de esto, una sola notificación de resumen. */
export const MAXIMO_SUELTAS = 3;

/** La ruta de la bandeja, a la que lleva el resumen. */
export const RUTA_BANDEJA = "/alertas";

export interface AlertaPorAvisar {
  id: string;
  titulo: string;
  mensaje: string;
  severidad: Severidad;
  accion_url: string | null;
  generada_en: string;
}

export interface Destino {
  id: string;
  severidad_minima: Severidad;
}

/** Lo que viaja al service worker (`public/sw.js` lo lee con estos nombres). */
export interface Notificacion {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Agrupa en el celular: una notificación nueva con la misma etiqueta reemplaza a la anterior. */
  etiqueta: string;
  /** Crítica o alta: el aparato la mantiene a la vista hasta que se toque. */
  urgente: boolean;
}

export function esSeveridad(v: unknown): v is Severidad {
  return typeof v === "string" && v in ORDEN_SEVERIDAD;
}

/**
 * Una ruta de dentro del ERP, o la bandeja.
 *
 * `accion_url` la escribe la base, pero lo que abre el service worker no
 * puede ser una dirección de fuera: `//otro.sitio` o `https://…` convertirían
 * un aviso en un enlace a cualquier parte.
 */
export function rutaSegura(url: string | null | undefined): string {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return RUTA_BANDEJA;
  }
  return url;
}

/** Las que le tocan a un aparato, de la más grave a la más leve y, a igual gravedad, de la más antigua. */
export function filtrarPara(alertas: readonly AlertaPorAvisar[], minima: Severidad): AlertaPorAvisar[] {
  const tope = ORDEN_SEVERIDAD[minima];
  return alertas
    .filter((a) => ORDEN_SEVERIDAD[a.severidad] >= tope)
    .sort(
      (a, b) =>
        ORDEN_SEVERIDAD[b.severidad] - ORDEN_SEVERIDAD[a.severidad] ||
        a.generada_en.localeCompare(b.generada_en),
    );
}

/** Cuántas son urgentes, dicho en palabras. */
function frasePorGravedad(alertas: readonly AlertaPorAvisar[]): string {
  const urgentes = alertas.filter((a) => ORDEN_SEVERIDAD[a.severidad] >= ORDEN_SEVERIDAD.alta).length;
  if (urgentes === 0) return "Ninguno es urgente.";
  if (urgentes === alertas.length) return urgentes === 1 ? "Es urgente." : "Todos son urgentes.";
  return urgentes === 1 ? "1 es urgente." : `${urgentes} son urgentes.`;
}

/** Los títulos distintos, con cuántas veces sale cada uno: «Factura por vencer (5)». */
function titulosAgrupados(alertas: readonly AlertaPorAvisar[]): string[] {
  const cuenta = new Map<string, number>();
  for (const a of alertas) cuenta.set(a.titulo, (cuenta.get(a.titulo) ?? 0) + 1);
  return [...cuenta].map(([t, n]) => (n > 1 ? `${t} (${n})` : t));
}

/** Las notificaciones de un aparato. Vacío si no le toca ninguna. */
export function notificacionesPara(
  alertas: readonly AlertaPorAvisar[],
  minima: Severidad,
): Notificacion[] {
  const suyas = filtrarPara(alertas, minima);
  if (suyas.length === 0) return [];

  if (suyas.length > MAXIMO_SUELTAS) {
    const titulos = titulosAgrupados(suyas);
    const lista =
      titulos.length > 3 ? `${titulos.slice(0, 3).join(", ")} y más.` : `${titulos.join(", ")}.`;
    return [
      {
        titulo: `Tienes ${suyas.length} avisos nuevos`,
        cuerpo: `${frasePorGravedad(suyas)} ${lista}`,
        url: RUTA_BANDEJA,
        etiqueta: "rodatech-resumen",
        urgente: suyas.some((a) => ORDEN_SEVERIDAD[a.severidad] >= ORDEN_SEVERIDAD.alta),
      },
    ];
  }

  return suyas.map((a) => ({
    titulo: a.titulo,
    cuerpo: a.mensaje,
    url: rutaSegura(a.accion_url),
    etiqueta: `rodatech-${a.id}`,
    urgente: ORDEN_SEVERIDAD[a.severidad] >= ORDEN_SEVERIDAD.alta,
  }));
}

/** El plan entero: qué sale hacia cada aparato. Los que no reciben nada no aparecen. */
export function planDeEnvio(
  alertas: readonly AlertaPorAvisar[],
  destinos: readonly Destino[],
): { destino: Destino; notificaciones: Notificacion[] }[] {
  return destinos
    .map((destino) => ({ destino, notificaciones: notificacionesPara(alertas, destino.severidad_minima) }))
    .filter((p) => p.notificaciones.length > 0);
}

/**
 * ¿Se puede dar por avisada la cola tras una pasada?
 *
 * `notificado_en` es de la alerta, no del aparato: una vez puesta, ya no sale
 * hacia nadie. Así que solo se pone si ALGO llegó, o si lo que falló no tiene
 * arreglo (el aparato ya no existe). Si todo falló por un problema pasajero
 * —el servicio de push caído, la red de Vercel—, la cola se queda como está y
 * la próxima pasada lo vuelve a intentar.
 *
 * Sin ningún aparato suscrito también se vacía: si no, el primero que se
 * suscriba recibiría de golpe todo lo acumulado desde que se instaló.
 */
export function seDaPorAvisada(resultados: { ok: boolean; definitivo: boolean }[]): boolean {
  if (resultados.length === 0) return true;
  return resultados.some((r) => r.ok) || resultados.every((r) => r.definitivo);
}

/** Lo que responde un servicio de push cuando la suscripción ya no existe. */
export function esCodigoDeBaja(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Los servicios de push de los navegadores de verdad. La misma lista que la
 * restricción `suscripcion_endpoint_ok` de la 162: el servidor le hace un POST
 * a esta dirección, y sin lista cualquiera con sesión podría apuntarlo a la
 * red interna (SSRF).
 */
const ENDPOINT_PERMITIDO =
  /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|google\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;

export function endpointPermitido(endpoint: string): boolean {
  return endpoint.length <= 1000 && ENDPOINT_PERMITIDO.test(endpoint);
}

/**
 * «iPhone · Safari», «Android · Chrome», «Windows · Edge». Es lo que se lee en
 * la lista de aparatos de «Mi perfil» para saber cuál quitar.
 */
export function describirAparato(agente: string): string {
  const ua = agente || "";
  const sistema = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Otro aparato";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

/** Las tres opciones de «Qué avisos te llegan», en palabras de la pantalla. */
export const OPCIONES_SEVERIDAD: { valor: Severidad; etiqueta: string }[] = [
  { valor: "alta", etiqueta: "Solo los urgentes" },
  { valor: "media", etiqueta: "Los importantes (recomendado)" },
  { valor: "info", etiqueta: "Todos, también los de menor importancia" },
];
