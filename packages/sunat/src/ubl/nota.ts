/**
 * Generación del XML UBL 2.1 para nota de crédito (07) y nota de débito (08).
 *
 * Comparte casi toda su estructura con la factura; las diferencias, verificadas
 * contra las plantillas oficiales de SUNAT (notacr2.1 / notadb2.1):
 *   - Raíz CreditNote / DebitNote (namespace propio), sin InvoiceTypeCode.
 *   - cac:DiscrepancyResponse: motivo de la nota (catálogo 09 crédito / 10 débito).
 *   - cac:BillingReference: documento (factura/boleta) que la nota afecta.
 *   - Total en LegalMonetaryTotal (crédito) o RequestedMonetaryTotal (débito).
 *   - Líneas CreditNoteLine/DebitNoteLine con CreditedQuantity/DebitedQuantity.
 */
import { create } from "xmlbuilder2";
import type { NotaComprobante } from "../dominio/index";
import { montoEnLetras } from "./numero-a-letras";
import {
  namespaces,
  n,
  fecha,
  hora,
  bloqueFirma,
  bloqueEmisor,
  bloqueReceptor,
  bloqueTaxTotal,
  valorVentaTotal,
  contenidoLinea,
} from "./comun";

const CREDITNOTE_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
const DEBITNOTE_NS = "urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2";

/** Genera el XML UBL 2.1 (sin firmar) de una nota de crédito o débito. */
export function generarNotaXml(doc: NotaComprobante): string {
  const { emisor, receptor, totales, moneda, tasaIgv } = doc;
  const esCredito = doc.tipoDocumento === "07";

  const raiz = esCredito ? "CreditNote" : "DebitNote";
  const ns = esCredito ? CREDITNOTE_NS : DEBITNOTE_NS;
  const nombreLinea = esCredito ? "cac:CreditNoteLine" : "cac:DebitNoteLine";
  const nombreCantidad = esCredito
    ? "cbc:CreditedQuantity"
    : "cbc:DebitedQuantity";
  const nombreTotal = esCredito
    ? "cac:LegalMonetaryTotal"
    : "cac:RequestedMonetaryTotal";

  const numAfectado = `${doc.documentoAfectado.serie}-${doc.documentoAfectado.correlativo}`;

  const cuerpo = {
    ...namespaces(ns),
    "ext:UBLExtensions": {
      "ext:UBLExtension": { "ext:ExtensionContent": {} },
    },
    "cbc:UBLVersionID": "2.1",
    "cbc:CustomizationID": "2.0",
    "cbc:ID": `${doc.serie}-${doc.correlativo}`,
    "cbc:IssueDate": fecha(doc.fechaEmision),
    "cbc:IssueTime": hora(doc.fechaEmision),
    "cbc:Note": {
      "@languageLocaleID": "1000",
      $: montoEnLetras(totales.total, moneda === "PEN" ? "SOLES" : moneda),
    },
    "cbc:DocumentCurrencyCode": moneda,
    "cac:DiscrepancyResponse": {
      "cbc:ReferenceID": numAfectado,
      "cbc:ResponseCode": doc.motivo,
      "cbc:Description": { $: doc.descripcionMotivo },
    },
    "cac:BillingReference": {
      "cac:InvoiceDocumentReference": {
        "cbc:ID": numAfectado,
        "cbc:DocumentTypeCode": doc.documentoAfectado.tipoDocumento,
      },
    },
    "cac:Signature": bloqueFirma(emisor.ruc, emisor.razonSocial),
    "cac:AccountingSupplierParty": bloqueEmisor(emisor),
    "cac:AccountingCustomerParty": bloqueReceptor(receptor),
    "cac:TaxTotal": bloqueTaxTotal(moneda, totales),
    [nombreTotal]: {
      "cbc:LineExtensionAmount": {
        "@currencyID": moneda,
        "#": n(valorVentaTotal(totales)),
      },
      "cbc:TaxInclusiveAmount": { "@currencyID": moneda, "#": n(totales.total) },
      "cbc:PayableAmount": { "@currencyID": moneda, "#": n(totales.total) },
    },
    [nombreLinea]: doc.items.map((it, i) =>
      contenidoLinea(it, i + 1, moneda, tasaIgv, nombreCantidad),
    ),
  };

  return create({ encoding: "UTF-8" }, { [raiz]: cuerpo }).end({
    prettyPrint: false,
  });
}
