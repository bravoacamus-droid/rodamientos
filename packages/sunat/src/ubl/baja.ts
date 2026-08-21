/**
 * Generación del XML de la Comunicación de Baja (RA).
 *
 * Anula un comprobante ya aceptado por SUNAT. Aplica a facturas (01) y sus notas
 * (07/08). Las boletas y sus notas NO se dan de baja por aquí: se anulan en el
 * resumen diario (RC) con estado "3". SUNAT la procesa de forma asíncrona (ticket).
 *
 * Estructura verificada contra la plantilla oficial (voided):
 *   - Raíz VoidedDocuments, UBL 2.0 / CustomizationID 1.0, namespace sac.
 *   - ReferenceDate = fecha de emisión del comprobante que se anula.
 *   - IssueDate     = fecha en que se comunica la baja.
 *   - Una VoidedDocumentsLine por comprobante, con su serie/correlativo y motivo.
 */
import { create } from "xmlbuilder2";
import { fecha, bloqueFirma } from "./comun";

/** Un comprobante a dar de baja. */
export interface DocumentoBaja {
  /** Tipo de documento (01 factura, 07/08 notas). */
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  /** Motivo de la baja (texto libre). */
  motivo: string;
}

export interface ComunicacionBaja {
  /** Correlativo de la comunicación del día (1, 2, ...). */
  correlativo: number;
  /** Fecha de emisión de los comprobantes que se anulan. */
  fechaEmisionDocs: Date;
  /** Fecha en que se comunica la baja. */
  fechaComunicacion: Date;
  emisor: { ruc: string; razonSocial: string };
  documentos: DocumentoBaja[];
}

/** Id de la baja: RA-AAAAMMDD-correlativo. */
export function idBaja(fechaComunicacion: Date, correlativo: number): string {
  const f = fecha(fechaComunicacion).replace(/-/g, "");
  return `RA-${f}-${correlativo}`;
}

/** Genera el XML (sin firmar) de la comunicación de baja. */
export function generarBajaXml(doc: ComunicacionBaja): string {
  const { emisor } = doc;
  const NS_VOIDED =
    "urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1";
  const NS_SAC =
    "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1";

  const lineas = doc.documentos.map((d, i) => ({
    "cbc:LineID": i + 1,
    "cbc:DocumentTypeCode": d.tipoDocumento,
    "sac:DocumentSerialID": d.serie,
    "sac:DocumentNumberID": d.correlativo,
    "sac:VoidReasonDescription": { $: d.motivo },
  }));

  const cuerpo = {
    "@xmlns": NS_VOIDED,
    "@xmlns:cac":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "@xmlns:cbc":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "@xmlns:ext":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "@xmlns:sac": NS_SAC,
    "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
    "ext:UBLExtensions": {
      "ext:UBLExtension": { "ext:ExtensionContent": {} },
    },
    "cbc:UBLVersionID": "2.0",
    "cbc:CustomizationID": "1.0",
    "cbc:ID": idBaja(doc.fechaComunicacion, doc.correlativo),
    "cbc:ReferenceDate": fecha(doc.fechaEmisionDocs),
    "cbc:IssueDate": fecha(doc.fechaComunicacion),
    "cac:Signature": bloqueFirma(emisor.ruc, emisor.razonSocial),
    "cac:AccountingSupplierParty": {
      "cbc:CustomerAssignedAccountID": emisor.ruc,
      "cbc:AdditionalAccountID": "6",
      "cac:Party": {
        "cac:PartyLegalEntity": {
          "cbc:RegistrationName": { $: emisor.razonSocial },
        },
      },
    },
    "sac:VoidedDocumentsLine": lineas,
  };

  return create({ encoding: "UTF-8" }, { VoidedDocuments: cuerpo }).end({
    prettyPrint: false,
  });
}
