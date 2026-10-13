"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarDocumentoSunat, type ResultadoSunat } from "@/lib/documento-sunat";

/**
 * El nombre de quien conduce o lleva la guía, traído por su DNI (14/10).
 *
 * Mismo motivo que el RUC de la agencia: el nombre va IMPRESO en la guía, y
 * tecleado a mano es como acaba saliendo distinto del que dice RENIEC. Y la
 * misma regla: es un atajo, nunca una puerta — sin cuota o sin red se escribe
 * a mano y se guarda igual.
 */

/** Los mismos que pueden tocar el maestro de transporte. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

export async function consultarDniPersona(numero: string): Promise<ResultadoSunat> {
  // Cada llamada gasta cuota COMPARTIDA de la empresa.
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede consultar documentos." };
  }
  if (typeof numero !== "string" || numero.length > 20) {
    return { ok: false, error: "El DNI no es válido." };
  }
  const limpio = numero.replace(/\D/g, "");
  // Antes de gastar nada: un DNI son ocho dígitos.
  if (!/^[0-9]{8}$/.test(limpio)) {
    return { ok: false, error: "El DNI son ocho dígitos." };
  }
  return consultarDocumentoSunat("DNI", limpio);
}
