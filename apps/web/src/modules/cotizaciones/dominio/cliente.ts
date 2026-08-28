/**
 * Lo que el selector de cliente sabe decir sin preguntarle a nadie.
 *
 * El ORDEN de los resultados lo decide Postgres (`buscar_clientes`, migración
 * 030): ahí están los índices. Aquí vive lo otro —qué se lee en cada fila, qué
 * se puede elegir y qué trozo del texto coincide con lo tecleado—, que es puro,
 * se prueba sin base y sin React, y es justo donde estaban los errores.
 *
 * Igual que en `reportes/dominio/rango.ts`: el «hoy» lo inyecta quien llama.
 * Un «cotizado ayer» no puede cambiar según la zona horaria del equipo que
 * abre la pantalla.
 */

/** Un cliente tal y como lo devuelven `buscar_clientes` y `clientes_sugeridos`. */
export interface ClienteOpcion {
  id: string;
  codigo: string;
  razon_social: string;
  nombre_comercial: string | null;
  numero_documento: string | null;
  tipo_documento: string;
  contacto: string | null;
  telefono: string | null;
  condicion_pago: string;
  /** Al elegir cliente se muestra su condición; «A crédito» sin decir a
   *  cuántos días no le sirve a nadie. */
  dias_credito: number;
  bloqueado: boolean;
  motivo_bloqueo: string | null;
  activo: boolean;
  /** Cuántas veces se le ha cotizado. Distingue a dos nombres parecidos. */
  cotizaciones: number;
  /** Fecha `aaaa-mm-dd` de la última cotización, o null si nunca. */
  ultima_cotizacion: string | null;
}

/* ------------------------------------------------------------------ Estado */

/**
 * Por qué NO se puede cotizar a este cliente, o null si sí se puede.
 *
 * Devuelve el motivo y no un booleano a propósito: una fila que simplemente no
 * se deja pulsar parece que la pantalla está rota. El bloqueo de un cliente
 * siempre tiene motivo escrito (lo exige `bloquearCliente`), así que hay algo
 * concreto que decir.
 */
export function motivoNoSeleccionable(
  cliente: Pick<ClienteOpcion, "activo" | "bloqueado" | "motivo_bloqueo">,
): string | null {
  if (!cliente.activo) {
    return "Está desactivado. Reactívalo en su ficha antes de cotizarle.";
  }
  if (cliente.bloqueado) {
    return cliente.motivo_bloqueo?.trim()
      ? `Bloqueado: ${cliente.motivo_bloqueo.trim()}`
      : "Está bloqueado y no se le puede cotizar.";
  }
  return null;
}

/**
 * La condición de pago en palabras.
 *
 * Sin importes: el dominio no formatea dinero, que lleva moneda y separadores
 * y eso es cosa de `@rodatech/ui`.
 */
export function resumenCredito(
  cliente: Pick<ClienteOpcion, "condicion_pago" | "dias_credito">,
): string {
  if (cliente.condicion_pago !== "credito") return "Al contado";
  return cliente.dias_credito > 0
    ? `A crédito · ${cliente.dias_credito} días`
    : "A crédito";
}

/* ------------------------------------------------------------- Cuánto hace */

/** Días enteros entre dos fechas `aaaa-mm-dd`, sin tocar el reloj. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * «Cotizado ayer», «hace 3 meses», «nunca cotizado».
 *
 * Se redondea a la unidad grande en cuanto se puede: al elegir cliente lo que
 * importa es si fue hace nada o hace mucho, no si fueron 47 o 52 días.
 *
 * Una fecha en el futuro se trata como hoy. Pasa —una cotización fechada a
 * mano— y «hace -3 días» no lo entiende nadie.
 */
export function ultimaVez(fecha: string | null, hoy: string): string {
  if (!fecha) return "Nunca cotizado";

  const dias = diasEntre(fecha, hoy);
  if (dias <= 0) return "Cotizado hoy";
  if (dias === 1) return "Cotizado ayer";
  if (dias < 7) return `Cotizado hace ${dias} días`;
  if (dias < 31) {
    const semanas = Math.floor(dias / 7);
    return semanas === 1 ? "Cotizado hace 1 semana" : `Cotizado hace ${semanas} semanas`;
  }
  if (dias < 365) {
    const meses = Math.max(1, Math.round(dias / 30));
    return meses === 1 ? "Cotizado hace 1 mes" : `Cotizado hace ${meses} meses`;
  }
  const años = Math.floor(dias / 365);
  return años === 1 ? "Cotizado hace 1 año" : `Cotizado hace ${años} años`;
}

/* --------------------------------------------------------------- Resaltado */

/**
 * Normaliza SIN mover las posiciones: minúsculas y sin tildes, carácter a
 * carácter.
 *
 * Es la parte delicada del resaltado. `texto.normalize("NFD")` quitando las
 * marcas también quita tildes, pero cambia el largo de la cadena, así que los
 * índices que devuelve `indexOf` sobre la versión normalizada ya no sirven
 * para cortar el texto ORIGINAL: el resaltado se desplaza una letra por cada
 * tilde que hubiera antes.
 *
 * Aquí cada carácter se sustituye solo si su versión plana ocupa lo mismo. Si
 * no —una ligadura, una «İ» turca—, se deja como está: peor es resaltar mal.
 */
function aplanarConservandoPosiciones(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    const plano = caracter.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    salida += plano.length === caracter.length ? plano : caracter;
  }
  return salida;
}

export interface Trozo {
  texto: string;
  coincide: boolean;
}

/**
 * Parte un texto en trozos según lo que se tecleó, para poder resaltarlo.
 *
 * Compara sin tildes y sin mayúsculas —«peru» tiene que resaltar «PERÚ»— pero
 * devuelve SIEMPRE los trozos del texto original: se resalta lo que el usuario
 * está leyendo, no una versión aplanada de ello.
 *
 * Resalta todas las apariciones, no solo la primera: en «FERRETERÍA FERRETERA»
 * dejar la segunda sin marcar parece un fallo.
 */
export function resaltar(texto: string, termino: string): Trozo[] {
  const aguja = aplanarConservandoPosiciones(termino.trim());
  if (aguja === "" || texto === "") return [{ texto, coincide: false }];

  const pajar = aplanarConservandoPosiciones(texto);
  const trozos: Trozo[] = [];
  let cursor = 0;

  for (;;) {
    const golpe = pajar.indexOf(aguja, cursor);
    if (golpe === -1) break;
    if (golpe > cursor) {
      trozos.push({ texto: texto.slice(cursor, golpe), coincide: false });
    }
    trozos.push({ texto: texto.slice(golpe, golpe + aguja.length), coincide: true });
    cursor = golpe + aguja.length;
  }

  if (cursor < texto.length) {
    trozos.push({ texto: texto.slice(cursor), coincide: false });
  }
  return trozos;
}

/* ----------------------------------------------------------- Qué se tecleó */

/**
 * Los dígitos de lo tecleado, como los extrae `buscar_clientes`.
 *
 * Sirve para dos cosas en la pantalla: decir «buscando por documento» y
 * ofrecer el alta rápida con el RUC ya escrito cuando la búsqueda no encuentra
 * nada. Es el gesto que pidió Willy (34:12): pegar el RUC y seguir.
 */
export function digitosDe(termino: string): string {
  return termino.replace(/\D/g, "");
}

/**
 * ¿Lo tecleado es un documento y no un nombre?
 *
 * Ocho dígitos es un DNI y once un RUC. Por debajo de ocho puede ser cualquier
 * cosa —un año, parte de un código— así que no se afirma nada.
 */
export function pareceDocumento(termino: string): boolean {
  const q = termino.trim();
  if (q === "") return false;
  const digitos = digitosDe(q);
  // Que sea SOLO dígitos y separadores: «SAC 20» no es un documento.
  if (!/^[\d\s.\-/]+$/.test(q)) return false;
  return digitos.length === 8 || digitos.length === 11;
}
