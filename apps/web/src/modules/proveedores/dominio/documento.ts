// Desde ./validacion, que no importa nada: este módulo lo consume un
// componente de navegador y las otras subrutas arrastran node:crypto.
import { dniValido, rucValido } from "@rodatech/consultas/validacion";

import type { TipoDocumento } from "./tipos";

/**
 * Reglas del documento de un proveedor. Todo puro.
 *
 * Comparte forma con `clientes/dominio/documento.ts` y NO se reutiliza a
 * propósito en un punto: aquí `SIN_DOC` es un caso corriente y no una
 * excepción. Un proveedor de importación —los envíos por DHL de los que habló
 * Willy (30:01)— muchas veces no tiene RUC peruano ni ningún documento que
 * sirva de clave, y forzar uno inventado ensucia el maestro para siempre.
 *
 * La validación del dígito verificador no se reimplementa: es la misma que usa
 * `@rodatech/consultas` para decidir si sale a la red. Si hubiera dos copias,
 * un día divergirían y la interfaz aceptaría un RUC que el paquete rechaza.
 */

const LARGO_MIN_ALFANUMERICO = 4;
const LARGO_MAX_ALFANUMERICO = 20;

export type RevisionDocumento =
  | { ok: true; numero: string | null }
  | { ok: false; error: string };

/**
 * Deja el número tal como lo quiere la base.
 *
 * El pegado desde un correo o un PDF trae de todo: «R.U.C. 20131312955»,
 * «20-131312955», espacios finos, saltos de línea.
 */
export function normalizarDocumento(
  tipo: TipoDocumento,
  valor: string | null | undefined,
): string | null {
  if (tipo === "SIN_DOC") return null;
  if (typeof valor !== "string") return null;

  if (tipo === "RUC" || tipo === "DNI") {
    const soloDigitos = valor.replace(/\D/g, "");
    return soloDigitos === "" ? null : soloDigitos;
  }

  // Carné y pasaporte son alfanuméricos: se quitan los espacios (interiores
  // incluidos, que es como se pegan desde un escaneo) y se sube a mayúsculas
  // para que "ab1234" y "AB 1234" no entren dos veces al maestro.
  const compacto = valor.replace(/\s+/g, "").toUpperCase();
  return compacto === "" ? null : compacto;
}

/** ¿Es utilizable este documento? Devuelve el número ya normalizado. */
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

  if (numero.length < LARGO_MIN_ALFANUMERICO || numero.length > LARGO_MAX_ALFANUMERICO) {
    return {
      ok: false,
      error: `El número debe tener entre ${LARGO_MIN_ALFANUMERICO} y ${LARGO_MAX_ALFANUMERICO} caracteres.`,
    };
  }

  return { ok: true, numero };
}

/** ¿Tiene sentido gastar una consulta de Decolecta en esto? */
export function esConsultable(
  tipo: TipoDocumento,
  valor: string | null | undefined,
): boolean {
  if (tipo !== "RUC" && tipo !== "DNI") return false;
  return revisarDocumento(tipo, valor).ok;
}

/**
 * El código del proveedor, que NO lo escribe nadie.
 *
 * `proveedores.codigo` es NOT NULL y su UNIQUE va sobre
 * `normalizar_codigo(codigo)` —sin espacios, sin separadores, en mayúsculas y
 * sin tildes—. Derivarlo del documento es lo único determinista: el documento
 * ya es único por `ux_proveedores_documento`, así que el código hereda esa
 * unicidad y el mismo proveedor dado de alta dos veces choca por las dos vías.
 *
 * Se antepone el tipo porque el UNIQUE del documento es (tipo, número).
 *
 * Sin documento —el caso del proveedor de importación— no hay nada
 * determinista de donde tirar, así que se cae a la razón social y la unicidad
 * la resuelve `variante()` reintentando.
 */
export function codigoDeProveedor(
  tipo: TipoDocumento,
  numero: string | null,
  razonSocial: string,
): string {
  if (numero) return `${tipo}-${numero}`;

  const raiz = razonSocial
    .normalize("NFD")
    // \p{Mn} son las marcas diacríticas que NFD acaba de separar de su letra:
    // "Ñ" queda como "N" y "Á" como "A", que es lo que hace `unaccent` en la
    // base. Sin esto, el código generado y su forma normalizada en Postgres
    // dejarían de coincidir.
    .replace(/\p{Mn}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return raiz === "" ? "SD-PROVEEDOR" : `SD-${raiz}`;
}

/**
 * Siguiente candidato cuando el código ya está tomado.
 *
 * El sufijo va con guion por legibilidad aunque `normalizar_codigo` se lo
 * coma: lo que tiene que ser distinto es el resultado normalizado, y "…-2" y
 * "…-3" lo son.
 */
export function variante(codigoBase: string, intento: number): string {
  return `${codigoBase}-${intento}`;
}
