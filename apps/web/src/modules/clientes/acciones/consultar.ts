"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarDocumentoSunat } from "@/lib/documento-sunat";

import { esConsultable, revisarDocumento } from "../dominio/documento";
import type { ResultadoDocumento, TipoDocumento } from "../dominio/tipos";

/**
 * Traer de SUNAT/RENIEC los datos de un documento para llenar el alta.
 *
 * El trabajo de verdad —contexto del paquete, cuota, caché, traducción de
 * fallos— vive en `@/lib/documento-sunat`, compartido con el maestro de
 * proveedores. La cuota es una sola para toda la empresa, y tenerla en dos
 * copias garantizaba que un día divergieran.
 *
 * Lo que se queda aquí es lo que SÍ es de este módulo: quién puede consultar,
 * y las reglas del documento de un cliente.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;

export async function buscarPorDocumento(
  tipo: TipoDocumento,
  numero: string,
): Promise<ResultadoDocumento> {
  // 1 · Identidad y rol. Cada llamada de aquí gasta cuota compartida de la
  // empresa: no puede quedar abierta a cualquiera con una sesión.
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede consultar documentos." };
  }

  // 2 · Entrada. Los argumentos de una Server Action llegan del navegador:
  // `tipo` podría ser cualquier cosa y `numero` un texto arbitrariamente largo.
  if (!["RUC", "DNI", "CE", "PAS", "SIN_DOC"].includes(tipo)) {
    return { ok: false, error: "Tipo de documento no válido." };
  }
  if (typeof numero !== "string" || numero.length > 40) {
    return { ok: false, error: "El número de documento no es válido." };
  }

  // 3 · Validación local ANTES de gastar nada. Un RUC con el dígito
  // verificador mal es el error de tecleo más común y el más caro: sin esto,
  // cada uno se lleva por delante una de las 100 consultas del mes.
  const revision = revisarDocumento(tipo, numero);
  if (!revision.ok) return { ok: false, error: revision.error };

  if (!esConsultable(tipo, numero)) {
    return {
      ok: false,
      error:
        "Solo se pueden consultar RUC y DNI. El carné de extranjería y el pasaporte se escriben a mano.",
    };
  }

  return consultarDocumentoSunat(tipo as "RUC" | "DNI", revision.numero as string);
}
