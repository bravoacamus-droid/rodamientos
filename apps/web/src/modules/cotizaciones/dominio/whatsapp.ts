/**
 * Enlace de WhatsApp para mandar la cotización (02:18).
 *
 * Es una función pura porque lo difícil no es armar la URL, es el teléfono:
 * en la ficha de un cliente peruano ese campo trae de todo —«999 888 777»,
 * «+51 999888777», «01-4567890», «(51) 999-888-777»— y `wa.me` solo acepta
 * dígitos con prefijo de país. Un enlace mal formado no falla: abre WhatsApp
 * con un número que no existe, y el vendedor cree que lo mandó.
 */

const PERU = "51";

/**
 * Deja el número como lo quiere wa.me: solo dígitos, con prefijo de país.
 *
 * Devuelve null cuando no hay forma de deducir un número válido. Preferimos no
 * ofrecer el botón antes que ofrecer uno que abre un chat vacío.
 */
export function normalizarTelefono(crudo: string | null | undefined): string | null {
  if (!crudo) return null;

  // El 00 inicial es el prefijo internacional a la vieja usanza.
  const d = crudo.replace(/\D/g, "").replace(/^00/, "");
  if (d === "") return null;

  // Ya viene con código de país.
  if (d.startsWith(PERU) && (d.length === 11 || d.length === 12)) return d;

  // Móvil peruano: nueve dígitos que empiezan en 9.
  if (d.length === 9 && d.startsWith("9")) return PERU + d;

  // Fijo de Lima con su cero de tránsito: 01 seguido de siete dígitos.
  if (d.length === 9 && d.startsWith("01")) return PERU + d.slice(1);

  // Fijo de Lima sin el cero.
  if (d.length === 8 && d.startsWith("1")) return PERU + d;

  // Fijo de provincia: cero + código de dos dígitos + seis.
  if (d.length === 9 && d.startsWith("0")) return PERU + d.slice(1);

  // Un número extranjero razonable se respeta tal cual.
  if (d.length >= 10 && d.length <= 15) return d;

  return null;
}

export interface DatosMensaje {
  numero: string;
  cliente: string;
  total: number;
  validaHasta: string;
  emisor: string;
  /** Enlace a la ficha, si el cliente lo puede abrir. */
  enlace?: string | null;
}

/**
 * El texto que se manda.
 *
 * Corto a propósito: lo que decide si el cliente contesta es el número de la
 * cotización y el monto, no un párrafo. Todo lo demás va en el PDF adjunto,
 * que el vendedor arrastra al chat.
 */
export function mensajeCotizacion(d: DatosMensaje): string {
  const monto = d.total.toLocaleString("es-PE", {
    style: "currency",
    currency: "USD",
  });

  const lineas = [
    `Buen día, ${d.cliente}.`,
    "",
    `Le envío la cotización ${d.numero} por ${monto} (incluye IGV).`,
    `Válida hasta el ${formatoFecha(d.validaHasta)}.`,
  ];

  if (d.enlace) {
    lineas.push("", d.enlace);
  }

  lineas.push("", d.emisor);
  return lineas.join("\n");
}

/** AAAA-MM-DD a DD/MM/AAAA, que es como se lee una fecha en Perú. */
export function formatoFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * El enlace completo, o null si el cliente no tiene un teléfono usable.
 *
 * Se usa `wa.me` y no `whatsapp://`: funciona igual en el móvil y en WhatsApp
 * Web, que es desde donde Willy va a mandar la mayoría.
 */
export function enlaceWhatsapp(
  telefono: string | null | undefined,
  datos: DatosMensaje,
): string | null {
  const numero = normalizarTelefono(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeCotizacion(datos))}`;
}

/**
 * El asunto del correo.
 *
 * Lleva el número delante porque es por lo que se busca meses después, cuando
 * el cliente escribe «lo de la cotización que me mandaste» y hay que
 * encontrarla entre trescientos correos.
 */
export function asuntoCotizacion(d: DatosMensaje): string {
  return `Cotización ${d.numero} · ${d.emisor}`;
}

/**
 * El enlace de correo, o `null` si el cliente no tiene una dirección usable.
 *
 * Willy, 07/09 (13:21): *«correo y WhatsApp»*. Es el mismo texto por los dos
 * sitios a propósito: si el cliente recibe uno por chat y otro por correo, lo
 * último que hace falta es que digan cosas distintas.
 *
 * `mailto:` NO puede adjuntar el PDF —ningún navegador lo permite, por una
 * razón evidente— así que abre el correo escrito y el PDF se arrastra, igual
 * que en WhatsApp. Es lo que Willy ya hace a mano; esto le ahorra escribir.
 */
export function enlaceCorreoCotizacion(
  email: string | null | undefined,
  datos: DatosMensaje,
): string | null {
  const limpio = (email ?? "").trim();
  // Comprobación deliberadamente floja: aquí no se valida un correo, se decide
  // si merece la pena abrir el cliente de correo. Rechazar por una tilde rara
  // en un dominio válido sería peor que abrirlo y que el usuario lo vea.
  if (!limpio.includes("@") || limpio.length < 5 || /\s/.test(limpio)) return null;

  const cuerpo = encodeURIComponent(mensajeCotizacion(datos));
  const asunto = encodeURIComponent(asuntoCotizacion(datos));
  return `mailto:${encodeURIComponent(limpio)}?subject=${asunto}&body=${cuerpo}`;
}
