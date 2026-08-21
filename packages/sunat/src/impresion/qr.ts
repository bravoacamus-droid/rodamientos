/**
 * Código QR de la representación impresa.
 *
 * Toda representación impresa que se entrega al comprador debe llevar un QR con
 * los datos del comprobante, para que cualquiera pueda contrastarlo contra
 * SUNAT sin tipear nada.
 *
 * Contenido, en este orden y separado por "|" (Anexo de la RS 097-2012/SUNAT):
 *   1. RUC del emisor
 *   2. Tipo de comprobante (catálogo 01)
 *   3. Serie
 *   4. Número correlativo
 *   5. Monto total del IGV
 *   6. Importe total del comprobante
 *   7. Fecha de emisión (AAAA-MM-DD)
 *   8. Tipo de documento del adquirente (catálogo 06)
 *   9. Número de documento del adquirente
 *
 * Los importes van con dos decimales, igual que en el XML: el QR y el
 * comprobante electrónico deben decir exactamente lo mismo.
 */
import QRCode from "qrcode";
import { fecha } from "../ubl/comun";

export interface DatosQr {
  rucEmisor: string;
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  igv: number;
  total: number;
  fechaEmision: Date;
  receptorTipoDoc: string;
  receptorNumDoc: string;
}

/** Cadena que se codifica dentro del QR. */
export function contenidoQr(d: DatosQr): string {
  return [
    d.rucEmisor,
    d.tipoDocumento,
    d.serie,
    String(d.correlativo),
    d.igv.toFixed(2),
    d.total.toFixed(2),
    fecha(d.fechaEmision),
    d.receptorTipoDoc,
    d.receptorNumDoc,
  ].join("|");
}

/**
 * Genera el QR como SVG embebible.
 *
 * SVG y no PNG a propósito: la representación impresa se imprime, y el SVG no
 * pierde definición al escalar ni depende de la resolución del papel. Nivel de
 * corrección M, el habitual para comprobantes: aguanta manchas de tinta sin
 * inflar el tamaño del código.
 */
export async function generarQrSvg(d: DatosQr): Promise<string> {
  return QRCode.toString(contenidoQr(d), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
  });
}
