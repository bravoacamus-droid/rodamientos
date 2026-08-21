/**
 * Lectura del CDR (Constancia de Recepción) que devuelve SUNAT.
 *
 * El CDR es un ApplicationResponse UBL. Los campos relevantes, verificados
 * contra Greenter (Ws\Reader\DomCdrReader):
 *   - cac:DocumentResponse/cac:Response/cbc:ResponseCode  → "0" = aceptado
 *   - cac:DocumentResponse/cac:Response/cbc:Description    → mensaje
 *   - cbc:Note (0..n)                                      → observaciones
 *
 * Códigos de respuesta SUNAT:
 *   0        → aceptado
 *   100-1999 → excepción (rechazo definitivo del emisor/receptor)
 *   2000-3999→ error del comprobante (rechazado)
 *   4000+    → observación (aceptado CON observaciones)
 */
import { XMLParser } from "fast-xml-parser";
import type { ResultadoCdr } from "../dominio/index";

export function parsearCdr(cdrXml: string): ResultadoCdr {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
  });
  const doc = parser.parse(cdrXml);

  const appResp = doc?.ApplicationResponse ?? doc;
  const docResponse = appResp?.DocumentResponse ?? {};
  const response = docResponse?.Response ?? {};

  const codigo = String(response?.ResponseCode ?? "").trim();
  const descripcion = String(response?.Description ?? "").trim();

  // Las notas pueden venir como string único o como arreglo.
  const notasRaw = appResp?.Note;
  const observaciones: string[] = Array.isArray(notasRaw)
    ? notasRaw.map((n) => String(n).trim()).filter(Boolean)
    : notasRaw
      ? [String(notasRaw).trim()]
      : [];

  const aceptado = codigo === "0" || esCodigoObservacion(codigo);

  return {
    aceptado,
    codigo,
    descripcion,
    observaciones,
    cdrXml,
  };
}

/** 4000+ = aceptado con observaciones. */
function esCodigoObservacion(codigo: string): boolean {
  const n = Number(codigo);
  return Number.isFinite(n) && n >= 4000;
}
