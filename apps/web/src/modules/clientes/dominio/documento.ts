/**
 * Reglas del documento de identidad de un cliente. Todo puro.
 *
 * Este archivo existe por una razón económica muy concreta: el plan de
 * Decolecta son 100 consultas al mes y no se recargan. Un RUC mal tecleado
 * que sale a la red es una consulta quemada para siempre, así que la
 * validación local corre SIEMPRE antes de la consulta, y por eso vive en
 * `dominio/`: sin I/O, sin base de datos, comprobable en milisegundos.
 *
 * La validación del dígito verificador no se reimplementa aquí: es la misma
 * que usa `@rodatech/consultas` para decidir si sale a la red. Si hubiera dos
 * copias, un día divergirían y la interfaz aceptaría un RUC que el paquete
 * rechaza (o al revés).
 */

// Desde ./validacion, que no importa nada: este módulo lo consume un
// componente de navegador y las otras subrutas arrastran node:crypto.
import { dniValido, rucValido } from "@rodatech/consultas/validacion";

import type { TipoDocumento } from "./tipos";

/** Lo que admite la restricción `clientes_documento_ok` para CE y PAS. */
const LARGO_MIN_ALFANUMERICO = 4;
const LARGO_MAX_ALFANUMERICO = 20;

export type RevisionDocumento =
  | { ok: true; numero: string | null }
  | { ok: false; error: string };

/**
 * Deja el número tal como lo quiere la base.
 *
 * El pegado desde un correo o un PDF trae de todo: «R.U.C. 20131312955»,
 * «20-131312955», espacios finos, saltos de línea. Para RUC y DNI la base
 * exige `^[0-9]{n}$`, así que se conserva solo el dígito; si se dejara pasar
 * el guion, el INSERT reventaría con un error de restricción que nadie
 * entiende, en vez de con un mensaje.
 */
export function normalizarDocumento(
  tipo: TipoDocumento,
  valor: string | null | undefined,
): string | null {
  // SIN_DOC obliga a `numero_documento is null` por restricción. Un "" ahí
  // dentro no es "sin documento", es un documento vacío, y la base lo rechaza.
  if (tipo === "SIN_DOC") return null;
  if (typeof valor !== "string") return null;

  if (tipo === "RUC" || tipo === "DNI") {
    const soloDigitos = valor.replace(/\D/g, "");
    return soloDigitos === "" ? null : soloDigitos;
  }

  // Carné de extranjería y pasaporte son alfanuméricos: se quitan los espacios
  // (interiores incluidos, que es como se pegan desde un escaneo) y se sube a
  // mayúsculas para que "ab1234" y "AB 1234" no entren dos veces al maestro.
  const compacto = valor.replace(/\s+/g, "").toUpperCase();
  return compacto === "" ? null : compacto;
}

/**
 * ¿Es utilizable este documento? Devuelve el número ya normalizado.
 *
 * Reproduce a propósito la restricción `clientes_documento_ok` del esquema:
 * la base es la última línea, pero un error de restricción de Postgres no es
 * un mensaje que se le pueda enseñar a un vendedor.
 */
export function revisarDocumento(
  tipo: TipoDocumento,
  valor: string | null | undefined,
): RevisionDocumento {
  const numero = normalizarDocumento(tipo, valor);

  if (tipo === "SIN_DOC") return { ok: true, numero: null };

  if (numero === null) {
    return { ok: false, error: "Falta el número de documento." };
  }

  if (tipo === "RUC") {
    return rucValido(numero)
      ? { ok: true, numero }
      : {
          ok: false,
          error:
            "El RUC debe tener 11 dígitos, empezar por 10, 15, 17 o 20 y terminar en un dígito verificador correcto. Revisa el número.",
        };
  }

  if (tipo === "DNI") {
    return dniValido(numero)
      ? { ok: true, numero }
      : { ok: false, error: "El DNI debe tener exactamente 8 dígitos." };
  }

  if (
    numero.length < LARGO_MIN_ALFANUMERICO ||
    numero.length > LARGO_MAX_ALFANUMERICO
  ) {
    return {
      ok: false,
      error: `El número debe tener entre ${LARGO_MIN_ALFANUMERICO} y ${LARGO_MAX_ALFANUMERICO} caracteres.`,
    };
  }

  return { ok: true, numero };
}

/**
 * ¿Tiene sentido gastar una consulta de Decolecta en esto?
 *
 * Solo RUC y DNI: el proveedor expone SUNAT y RENIEC, y nada más. Un carné de
 * extranjería o un pasaporte se escriben a mano siempre, no porque falte cupo
 * sino porque no hay a quién preguntarle.
 */
export function esConsultable(
  tipo: TipoDocumento,
  valor: string | null | undefined,
): boolean {
  if (tipo !== "RUC" && tipo !== "DNI") return false;
  return revisarDocumento(tipo, valor).ok;
}

/**
 * El código del cliente, que NO lo escribe nadie.
 *
 * `clientes.codigo` es NOT NULL y su UNIQUE va sobre `normalizar_codigo(codigo)`
 * —sin espacios, sin separadores, en mayúsculas y sin tildes—. Derivarlo del
 * documento es lo único determinista que existe: el documento ya es único por
 * `ux_clientes_documento`, así que el código hereda esa unicidad gratis y el
 * mismo cliente dado de alta dos veces choca por las dos vías, no por una.
 *
 * Se antepone el tipo porque el UNIQUE del documento es (tipo, número): el DNI
 * 12345678 y un CE 12345678 pueden convivir, y sin prefijo compartirían código.
 *
 * Sin documento no hay nada determinista de donde tirar, así que se cae a la
 * razón social y la unicidad la resuelve `variante()` reintentando.
 */
export function codigoDeCliente(
  tipo: TipoDocumento,
  numero: string | null,
  razonSocial: string,
): string {
  if (numero) return `${tipo}-${numero}`;

  const raiz = razonSocial
    .normalize("NFD")
    // \p{Mn} son las marcas diacr\u00edticas que NFD acaba de separar de su letra:
    // "\u00d1" queda como "N" y "\u00c1" como "A", que es lo que hace `unaccent` en la
    // base. Sin esto, el c\u00f3digo generado y su forma normalizada en Postgres
    // dejar\u00edan de coincidir.
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return raiz === "" ? "SD-CLIENTE" : `SD-${raiz}`;
}

/**
 * Siguiente candidato cuando el código ya está tomado.
 *
 * El sufijo va con guion por legibilidad aunque `normalizar_codigo` se lo
 * coma: lo que tiene que ser distinto es el resultado normalizado, y "…-2" y
 * "…-3" lo son. Si aun así chocara —un código cargado a mano con esa forma
 * exacta—, el bucle de la acción sigue subiendo el número.
 */
export function variante(codigoBase: string, intento: number): string {
  return `${codigoBase}-${intento}`;
}
