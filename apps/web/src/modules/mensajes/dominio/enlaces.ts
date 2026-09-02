// `normalizarTelefono` vive en cotizaciones porque se escribió para mandarle
// la cotización al cliente, y ahí está probada contra los formatos reales de
// la ficha: «999 888 777», «+51 999888777», «01-4567890». Se importa en vez de
// copiarla: dos copias de una regla de teléfonos peruanos divergirían, y la
// que se quedara vieja abriría chats con números que no existen.
//
// POR LA RUTA PROFUNDA y no por `@/modules/cotizaciones`, aunque el índice
// lo exporte. El índice reexporta también su `api/`, que es `server-only`;
// como este archivo acaba dentro de un componente de cliente, importarlo
// por ahí arrastra el cliente de Supabase al navegador y Next falla al
// construir. No lo caza ni el typecheck ni el lint: solo abrir la pantalla.
import { normalizarTelefono } from "@/modules/cotizaciones/dominio/whatsapp";

import { TOPE_WHATSAPP } from "./plantillas";

/**
 * Los enlaces con los que se manda: `wa.me` y `mailto:`.
 *
 * NO es envío automático, y no lo será: eso pide la Cloud API de Meta —número
 * dedicado, verificación del negocio, plantillas aprobadas y pago por
 * conversación—, más el riesgo de que baneen el número por escribir en masa a
 * quien no ha escrito antes. Para pedirle precio a cuatro proveedores
 * conocidos no compensa.
 *
 * Con esto se abre WhatsApp con el mensaje ya escrito y la persona pulsa
 * enviar. Es lo que Willy hace hoy a mano (30:01, *«por WhatsApp o por
 * correo»*), solo que sin teclear.
 */

/** El enlace, o null si de ese teléfono no sale un número usable. */
export function enlaceWhatsapp(
  telefono: string | null | undefined,
  texto: string,
): string | null {
  const numero = normalizarTelefono(telefono);
  if (!numero) return null;
  // `wa.me` corta por el final pasados los 4.096 caracteres. Se recorta aquí
  // para que lo que se ve en la vista previa sea lo que se manda.
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto.slice(0, TOPE_WHATSAPP))}`;
}

/** Un `mailto:` con asunto y cuerpo, o null si no hay a quién escribirle. */
export function enlaceCorreo(
  correo: string | null | undefined,
  asunto: string,
  cuerpo: string,
): string | null {
  const limpio = (correo ?? "").trim();
  // Comprobación deliberadamente floja: aquí no se valida un correo, se decide
  // si merece la pena ofrecer el botón. Rechazar un correo raro pero válido
  // sería peor que abrir el cliente de correo con una dirección que el usuario
  // ve y corrige.
  if (!limpio.includes("@") || /\s/.test(limpio)) return null;

  const partes = [`subject=${encodeURIComponent(asunto)}`, `body=${encodeURIComponent(cuerpo)}`];
  return `mailto:${limpio}?${partes.join("&")}`;
}

/** ¿Se le puede escribir a este proveedor, y por dónde? */
export function canalesDisponibles(contacto: {
  telefono?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}): { whatsapp: boolean; correo: boolean } {
  return {
    // El campo `whatsapp` manda sobre `telefono`: puede haber un fijo en uno y
    // el móvil en el otro, y a un fijo no se le escribe.
    whatsapp: normalizarTelefono(contacto.whatsapp ?? contacto.telefono) !== null,
    correo: enlaceCorreo(contacto.email, "x", "x") !== null,
  };
}
