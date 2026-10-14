import "server-only";

import { generarQrPng, generarQrSvg } from "@rodatech/sunat/impresion";

import { docSunatDe } from "../dominio/emision";
import { enMonedaDelDocumento } from "../dominio/moneda-documento";
import type { ComprobanteDetalle } from "../dominio/tipos";

/** El QR de un comprobante, en SVG para el papel y en PNG para el PDF. */
export interface QrComprobante {
  svg: string;
  png: string;
  hash: string | null;
}

const TIPO_SUNAT: Record<string, string> = {
  factura: "01",
  boleta: "03",
  nota_credito: "07",
  nota_debito: "08",
};

/**
 * El QR de la representación impresa (15/10).
 *
 * Su formato lo lleva —el QR abajo a la derecha, con el hash— y el nuestro
 * no. Es lo que deja contrastar el papel contra SUNAT sin tipear nada:
 * RUC | tipo | serie | número | IGV | total | fecha | tipo y número del
 * cliente, con los importes en la moneda del documento.
 *
 * Un borrador o un anulado no llevan QR: no hay nada que contrastar.
 */
export async function qrDeComprobante(original: ComprobanteDetalle, rucEmisor: string): Promise<QrComprobante | null> {
  if (!rucEmisor || original.estado === "anulado" || !original.correlativo) return null;
  const c = enMonedaDelDocumento(original);
  const datos = {
    rucEmisor,
    tipoDocumento: TIPO_SUNAT[c.tipo] ?? "01",
    serie: c.serie,
    correlativo: c.correlativo,
    igv: c.igv,
    total: c.total,
    fechaEmision: new Date(`${c.fecha_emision}T12:00:00`),
    receptorTipoDoc: docSunatDe(c.cliente_tipo_documento),
    receptorNumDoc: c.cliente_documento ?? "",
  };
  try {
    const [svg, png] = await Promise.all([generarQrSvg(datos), generarQrPng(datos)]);
    return { svg, png, hash: c.sunat_hash_cdr };
  } catch {
    return null;
  }
}
