/**
 * Lo que toda caja de búsqueda necesita saber sobre el texto que se teclea.
 *
 * Vive aquí y no dentro de un módulo porque lo usan dos —el selector de
 * cliente de cotizaciones y el de proveedor de compras y recepciones— y va
 * camino de usarlo el de productos. Es la misma decisión que `busqueda.ts`,
 * tomada por el mismo motivo: el fallo de carrera del 28/08 existía porque
 * cuatro pantallas tenían cuatro copias de la misma lógica y solo una estaba
 * bien.
 *
 * Todo lo de aquí es puro: sin React, sin red y sin reloj. El «hoy» lo inyecta
 * quien llama, igual que en `reportes/dominio/rango.ts` — un «hace un día» no
 * puede cambiar según la zona horaria del equipo que abre la pantalla.
 */

/* --------------------------------------------------------------- Resaltado */

/**
 * Normaliza SIN mover las posiciones: minúsculas y sin tildes, carácter a
 * carácter.
 *
 * Es la parte delicada del resaltado. `texto.normalize("NFD")` quitando las
 * marcas también quita tildes, pero CAMBIA EL LARGO de la cadena, así que los
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
 * Los dígitos de lo tecleado, como los extraen `buscar_clientes` (030) y
 * `buscar_proveedores` (033).
 *
 * Sirve para dos cosas en pantalla: decir «buscando por documento» y ofrecer
 * el alta rápida con el RUC ya escrito cuando la búsqueda no encuentra nada.
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

/* ------------------------------------------------------------- Cuánto hace */

/** Días enteros entre dos fechas `aaaa-mm-dd`, sin tocar el reloj. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * «hoy», «ayer», «hace 3 días», «hace 2 meses», «hace 1 año».
 *
 * Sin verbo delante, para que cada pantalla ponga el suyo: el selector de
 * cliente dice «Cotizado …» y el de proveedor «Comprado …».
 *
 * Se redondea a la unidad grande en cuanto se puede: al elegir con quién
 * trabajar importa si fue hace nada o hace mucho, no si fueron 47 o 52 días.
 *
 * Una fecha en el futuro se trata como hoy. Pasa —un documento fechado a
 * mano— y «hace -3 días» no lo entiende nadie.
 */
export function hace(fecha: string, hoy: string): string {
  const dias = diasEntre(fecha, hoy);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 31) {
    const semanas = Math.floor(dias / 7);
    return semanas === 1 ? "hace 1 semana" : `hace ${semanas} semanas`;
  }
  if (dias < 365) {
    const meses = Math.max(1, Math.round(dias / 30));
    return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  }
  const años = Math.floor(dias / 365);
  return años === 1 ? "hace 1 año" : `hace ${años} años`;
}
