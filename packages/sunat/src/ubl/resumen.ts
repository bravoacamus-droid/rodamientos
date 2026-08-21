/**
 * Generación del XML del Resumen Diario de Boletas (RC).
 *
 * Las boletas (03) no se envían una a una: se agrupan en un resumen diario que
 * SUNAT procesa de forma asíncrona (devuelve un ticket, no un CDR inmediato).
 * También las notas sobre boletas van por este resumen.
 *
 * Estructura verificada contra la plantilla oficial de SUNAT (summary):
 *   - Raíz SummaryDocuments, UBL 2.0 / CustomizationID 1.1, namespace sac.
 *   - ReferenceDate = día en que se emitieron las boletas.
 *   - IssueDate     = día en que se genera el resumen.
 *   - Una SummaryDocumentsLine por boleta con su estado (1=adicionar,
 *     2=modificar, 3=anular), totales e IGV.
 */
import { create } from "xmlbuilder2";
import { fecha, bloqueFirma } from "./comun";

/** Una boleta dentro del resumen. */
export interface BoletaResumen {
  /** Serie-correlativo, p.ej. "B001-15". */
  serieNumero: string;
  /** Estado: "1" adicionar (nueva), "2" modificar, "3" anular. */
  estado: string;
  /** Tipo de documento de identidad del cliente (catálogo 06). */
  clienteTipoDoc: string;
  /** Número de documento del cliente. */
  clienteNumDoc: string;
  /** Importe total con IGV. */
  total: number;
  /** Operaciones gravadas (sin IGV). */
  gravadas: number;
  /** Operaciones exoneradas. Se informan aparte de las gravadas. */
  exoneradas?: number;
  /** Operaciones inafectas. */
  inafectas?: number;
  /** IGV. */
  igv: number;
}

export interface ResumenBoletas {
  /** Correlativo del resumen del día (1, 2, ...). */
  correlativo: number;
  /** Día en que se emitieron las boletas. */
  fechaEmisionBoletas: Date;
  /** Día en que se genera y envía el resumen. */
  fechaGeneracion: Date;
  moneda: string;
  emisor: { ruc: string; razonSocial: string };
  boletas: BoletaResumen[];
}

function n(v: number): string {
  return v.toFixed(2);
}

/** Id del resumen: RC-AAAAMMDD-correlativo. */
export function idResumen(fechaGeneracion: Date, correlativo: number): string {
  const f = fecha(fechaGeneracion).replace(/-/g, "");
  return `RC-${f}-${correlativo}`;
}

/** Genera el XML (sin firmar) del resumen diario de boletas. */
export function generarResumenXml(doc: ResumenBoletas): string {
  const { emisor, moneda } = doc;
  const NS_SUMMARY =
    "urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1";
  const NS_SAC =
    "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1";

  const lineas = doc.boletas.map((b, i) => {
    // Un BillingPayment por tipo de operación (catálogo 51 del resumen):
    // 01 gravadas, 02 exoneradas, 03 inafectas. Solo se informan las que
    // existen; declarar lo exonerado como gravado pagaría IGV de más.
    const pagos = [
      { id: "01", monto: b.gravadas },
      { id: "02", monto: b.exoneradas ?? 0 },
      { id: "03", monto: b.inafectas ?? 0 },
    ]
      .filter((p, idx) => p.monto > 0 || idx === 0)
      .map((p) => ({
        "cbc:PaidAmount": { "@currencyID": moneda, "#": n(p.monto) },
        "cbc:InstructionID": p.id,
      }));

    return {
      "cbc:LineID": i + 1,
      "cbc:DocumentTypeCode": "03",
      "cbc:ID": b.serieNumero,
      "cac:AccountingCustomerParty": {
        "cbc:CustomerAssignedAccountID": b.clienteNumDoc,
        "cbc:AdditionalAccountID": b.clienteTipoDoc,
      },
      "cac:Status": { "cbc:ConditionCode": b.estado },
      "sac:TotalAmount": { "@currencyID": moneda, "#": n(b.total) },
      "sac:BillingPayment": pagos,
      "cac:TaxTotal": {
        "cbc:TaxAmount": { "@currencyID": moneda, "#": n(b.igv) },
        "cac:TaxSubtotal": {
          "cbc:TaxAmount": { "@currencyID": moneda, "#": n(b.igv) },
          "cac:TaxCategory": {
            "cac:TaxScheme": {
              "cbc:ID": "1000",
              "cbc:Name": "IGV",
              "cbc:TaxTypeCode": "VAT",
            },
          },
        },
      },
    };
  });

  const cuerpo = {
    "@xmlns": NS_SUMMARY,
    "@xmlns:cac":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "@xmlns:cbc":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
    "@xmlns:ext":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "@xmlns:sac": NS_SAC,
    "ext:UBLExtensions": {
      "ext:UBLExtension": { "ext:ExtensionContent": {} },
    },
    "cbc:UBLVersionID": "2.0",
    "cbc:CustomizationID": "1.1",
    "cbc:ID": idResumen(doc.fechaGeneracion, doc.correlativo),
    "cbc:ReferenceDate": fecha(doc.fechaEmisionBoletas),
    "cbc:IssueDate": fecha(doc.fechaGeneracion),
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
    "sac:SummaryDocumentsLine": lineas,
  };

  return create({ encoding: "UTF-8" }, { SummaryDocuments: cuerpo }).end({
    prettyPrint: false,
  });
}
