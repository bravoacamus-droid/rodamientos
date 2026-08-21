/**
 * Endpoints de los web services de SUNAT.
 * Verificados contra Greenter (Ws\Services\SunatEndpoints).
 */
import type { Ambiente } from "../index";

/** billService de comprobantes (factura, boleta, notas, resumen, baja). */
export function endpointFacturacion(ambiente: Ambiente): string {
  return ambiente === "produccion"
    ? "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService"
    : "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
}

/** billService de guías de remisión (GRE) — usado en la Fase D. */
export function endpointGuias(ambiente: Ambiente): string {
  return ambiente === "produccion"
    ? "https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService"
    : "https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService";
}
