import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Cifrado de las credenciales SUNAT en reposo.
 *
 * AES-256-GCM, que es cifrado *autenticado*: además de ocultar el contenido
 * detecta si alguien lo ha modificado. Con AES-CBC a secas un byte cambiado en
 * la base pasaría desapercibido y produciría una clave distinta sin avisar;
 * aquí el descifrado falla y se entera.
 *
 * Formato del blob, en base64:
 *
 *     [ IV (12 bytes) | authTag (16 bytes) | ciphertext (n bytes) ]
 *
 * El IV va delante y en claro, que es lo normal: no es secreto, solo tiene que
 * ser distinto en cada cifrado. Se genera al azar cada vez — reutilizar un IV
 * con GCM rompe el cifrado entero, no solo ese mensaje.
 *
 * Las claves cifradas viven en `config_sunat_secretos`, una tabla con RLS y
 * sin políticas que solo alcanza `service_role`. El cifrado es la segunda
 * capa: cubre el caso que de verdad pasa, que es un volcado de la base
 * compartido para depurar o una copia de seguridad que acaba donde no debe.
 */

const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12; // 96 bits, el recomendado para GCM
const LARGO_TAG = 16;

/** Error con mensaje accionable, que es lo que falta cuando esto se rompe. */
export class ErrorCifrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCifrado";
  }
}

/**
 * Lee y valida la llave maestra.
 *
 * Se lee en cada llamada y no una vez al cargar el módulo: en Next un módulo
 * de servidor puede quedar cacheado entre recargas, y una llave mal puesta
 * seguiría fallando después de arreglar el `.env` hasta reiniciar del todo.
 */
function llaveMaestra(): Buffer {
  const crudo = process.env.SUNAT_ENCRYPTION_KEY;
  if (!crudo) {
    throw new ErrorCifrado(
      "Falta SUNAT_ENCRYPTION_KEY. Genera una con: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))" ' +
        "y ponla en .env.local. Tiene que ser LA MISMA en todos los entornos: " +
        "con otra llave, las credenciales guardadas no se pueden descifrar.",
    );
  }

  const llave = Buffer.from(crudo, "base64");
  if (llave.length !== 32) {
    throw new ErrorCifrado(
      `SUNAT_ENCRYPTION_KEY tiene ${llave.length} bytes y AES-256 necesita 32. ` +
        "¿Se copió a medias, o se generó con otro tamaño?",
    );
  }
  return llave;
}

/** ¿Está configurada la llave? Para avisar en pantalla ANTES de intentar guardar. */
export function hayLlaveMaestra(): boolean {
  try {
    llaveMaestra();
    return true;
  } catch {
    return false;
  }
}

/** Cifra un texto. Devuelve el blob en base64 listo para guardar. */
export function cifrar(texto: string): string {
  const llave = llaveMaestra();
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, llave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString("base64");
}

/** Cifra datos binarios (el .pfx). Mismo formato. */
export function cifrarBinario(datos: Buffer): string {
  const llave = llaveMaestra();
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, llave, iv);
  const cifrado = Buffer.concat([cipher.update(datos), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString("base64");
}

/** Descifra a Buffer. Lanza si el blob está corrupto o la llave no es la suya. */
export function descifrarBinario(blob: string): Buffer {
  const llave = llaveMaestra();
  const crudo = Buffer.from(blob, "base64");

  // El mínimo es IV + tag exactos: el texto cifrado de una cadena vacía mide
  // cero bytes y sigue siendo un blob válido. Exigir uno más rechazaba un
  // secreto legítimamente vacío, que es justo el estado inicial de la
  // configuración.
  if (crudo.length < LARGO_IV + LARGO_TAG) {
    throw new ErrorCifrado(
      "El dato cifrado está truncado: no llega ni para la cabecera.",
    );
  }

  const iv = crudo.subarray(0, LARGO_IV);
  const tag = crudo.subarray(LARGO_IV, LARGO_IV + LARGO_TAG);
  const cifrado = crudo.subarray(LARGO_IV + LARGO_TAG);

  const decipher = createDecipheriv(ALGORITMO, llave, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(cifrado), decipher.final()]);
  } catch {
    // El fallo de GCM no distingue «llave equivocada» de «dato manipulado»,
    // y es correcto que no lo distinga. Pero la causa real casi siempre es la
    // primera, así que el mensaje apunta ahí.
    throw new ErrorCifrado(
      "No se pudo descifrar. Lo más probable es que SUNAT_ENCRYPTION_KEY no sea " +
        "la misma con la que se guardó. Si se perdió, hay que volver a escribir " +
        "las credenciales desde Configuración: no hay forma de recuperarlas.",
    );
  }
}

/** Descifra a texto. */
export function descifrar(blob: string): string {
  return descifrarBinario(blob).toString("utf8");
}

/**
 * ¿Son iguales dos secretos, sin filtrar por dónde difieren?
 *
 * `a === b` sale antes cuanto más pronto difieren, y esa diferencia de tiempo
 * es medible. Aquí no hay un atacante midiendo, pero comparar secretos así es
 * la clase de detalle que se copia a un sitio donde sí importa.
 */
export function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
