"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarDocumentoSunat, type ResultadoSunat } from "@/lib/documento-sunat";

import { esConsultable, revisarDocumento } from "../dominio/documento";
import type { TipoDocumento } from "../dominio/tipos";

/**
 * Traer de SUNAT los datos de un RUC para llenar el alta de un proveedor.
 *
 * El trabajo de verdad —contexto del paquete, cuota, caché, traducción de
 * fallos— vive en `@/lib/documento-sunat`, compartido con el maestro de
 * clientes. Aquí solo se queda lo que es de este módulo: **quién** puede
 * consultar (compras, no ventas) y las reglas del documento de un proveedor.
 *
 * Es una ayuda, no un requisito: sin cupo o sin token, la razón social se
 * escribe a mano desde la factura que el operador tiene delante.
 */

const ROLES = ["gerencia", "admin", "compras"] as const;

export async function buscarProveedorPorDocumento(
  tipo: TipoDocumento,
  numero: string,
): Promise<ResultadoSunat> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede consultar documentos." };
  }

  // Los argumentos de una Server Action llegan del navegador: `tipo` podría
  // ser cualquier cosa y `numero` un texto arbitrariamente largo.
  if (!["RUC", "DNI", "CE", "PAS", "SIN_DOC"].includes(tipo)) {
    return { ok: false, error: "Tipo de documento no válido." };
  }
  if (typeof numero !== "string" || numero.length > 40) {
    return { ok: false, error: "El número de documento no es válido." };
  }

  // Validación local ANTES de gastar nada: un RUC con el verificador mal es el
  // error de tecleo más común y cada uno que sale a la red se lleva una de las
  // 100 consultas del mes.
  const revision = revisarDocumento(tipo, numero);
  if (!revision.ok) return { ok: false, error: revision.error };

  if (!esConsultable(tipo, numero)) {
    return {
      ok: false,
      error:
        "Solo se pueden consultar RUC y DNI. Un proveedor del extranjero se escribe a mano.",
    };
  }

  return consultarDocumentoSunat(tipo as "RUC" | "DNI", revision.numero as string);
}
