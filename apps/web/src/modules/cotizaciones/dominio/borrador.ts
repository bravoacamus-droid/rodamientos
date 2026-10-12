import type { ClienteOpcion } from "./cliente";
import type { EstadoConstructor, LineaConstructor } from "./constructor";

/**
 * La cotización a medio hacer, guardada sola en el navegador (12/10).
 *
 * Luis preguntó qué se guarda al cotizar, y la respuesta tenía un agujero:
 * NADA hasta pulsar «Guardar». El análisis de compra de diez productos —diez
 * llamadas a proveedores— se perdía si se cerraba la pestaña. *«Sí, justo eso
 * también»*.
 *
 * Va en el navegador y no en la base a propósito: es un borrador de UNA
 * persona en UN equipo, no un documento. En la base habría que numerarlo,
 * listarlo y limpiarlo, y una cotización a medias no le sirve a nadie más.
 *
 * Puro: sin `localStorage` ni reloj (la hora llega de fuera). La pantalla lee
 * y escribe; esto decide qué vale la pena guardar y si lo leído sirve.
 */

export const VERSION_BORRADOR = 1;
/** Más viejo que esto ya no se ofrece: los precios de hace dos semanas mienten. */
export const DIAS_DE_VIDA = 14;

export interface Borrador {
  version: number;
  /** ISO. */
  guardado: string;
  estado: EstadoConstructor;
  cliente: ClienteOpcion | null;
}

/** La clave: una para la nueva y una por cotización que se edita. */
export function claveBorrador(editandoId: string | null): string {
  return editandoId ? `rodatech:cotizacion:editar:${editandoId}` : "rodatech:cotizacion:nueva";
}

/** Solo si hay algo que perder: un cliente o una línea. */
export function valeLaPena(estado: EstadoConstructor): boolean {
  return estado.clienteId !== null || estado.lineas.length > 0;
}

export function armarBorrador(
  estado: EstadoConstructor,
  cliente: ClienteOpcion | null,
  ahora: Date,
): Borrador {
  return { version: VERSION_BORRADOR, guardado: ahora.toISOString(), estado, cliente };
}

/** Una línea guardada antes de que existieran sus campos nuevos. */
function completarLinea(l: LineaConstructor): LineaConstructor {
  return {
    ...l,
    proveedores: Array.isArray(l.proveedores) ? l.proveedores : [],
    nota: typeof l.nota === "string" ? l.nota : "",
  };
}

/**
 * Lo leído del navegador, o null si no sirve: roto, de otra versión, vacío o
 * más viejo de {@link DIAS_DE_VIDA} días.
 */
export function leerBorrador(crudo: string | null, ahora: Date): Borrador | null {
  if (!crudo) return null;
  let b: Partial<Borrador>;
  try {
    b = JSON.parse(crudo) as Partial<Borrador>;
  } catch {
    return null;
  }
  if (!b || b.version !== VERSION_BORRADOR || !b.estado || !Array.isArray(b.estado.lineas)) return null;
  const guardado = new Date(String(b.guardado));
  if (Number.isNaN(guardado.getTime())) return null;
  if (ahora.getTime() - guardado.getTime() > DIAS_DE_VIDA * 86_400_000) return null;
  const estado: EstadoConstructor = { ...b.estado, lineas: b.estado.lineas.map(completarLinea) };
  if (!valeLaPena(estado)) return null;
  return { version: VERSION_BORRADOR, guardado: guardado.toISOString(), estado, cliente: b.cliente ?? null };
}

/**
 * ¿El borrador dice algo distinto de lo que ya hay en pantalla? Al editar,
 * uno idéntico a lo guardado en la base no merece el aviso.
 */
export function esDistinto(b: Borrador, actual: EstadoConstructor): boolean {
  const huella = (e: EstadoConstructor) => JSON.stringify({ ...e, proximaKey: 0, lineas: e.lineas.map((l) => ({ ...l, key: "" })) });
  return huella(b.estado) !== huella(actual);
}
