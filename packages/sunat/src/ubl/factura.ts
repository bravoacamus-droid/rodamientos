/**
 * Generación del XML UBL 2.1 para factura (01) y boleta (03).
 *
 * Alcance: operaciones gravadas, exoneradas e inafectas (la afectación sale del
 * producto), moneda única, sin descuentos globales, detracciones, anticipos ni
 * ISC. El orden de los elementos sigue la
 * especificación UBL 2.1 de SUNAT (verificado contra la plantilla oficial); el
 * orden importa: SUNAT valida contra el XSD y rechaza si un elemento va fuera de
 * secuencia.
 *
 * El nodo ext:ExtensionContent queda vacío a propósito: ahí inyecta la firma el
 * módulo `firma/`. No se toca aquí.
 */
import { create } from "xmlbuilder2";
import type { Comprobante } from "../dominio/index";
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

const INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const CAT01_URI = "urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01";
const CAT51_URI = "urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51";
/** Tipo de operación por defecto: 0101 = Venta interna (catálogo 51). */
const TIPO_OPERACION_VENTA = "0101";

/**
 * El bloque cac:PaymentTerms, que declara cómo se paga el comprobante.
 *
 * Hasta ahora esto era una constante con la palabra «Contado» escrita a mano, y por
 * tanto una MENTIRA en cuanto el sistema aprendió a vender al crédito: la factura a
 * 30 días se le declaraba a SUNAT como cobrada. Nadie lo habría notado hasta un
 * cruce de información.
 *
 * Al crédito SUNAT exige dos cosas más, y las dos son obligatorias:
 *   - Un nodo con el SALDO PENDIENTE (`Credito` + Amount).
 *   - Un nodo por CUOTA, rotulado Cuota001, Cuota002…, con su importe y su fecha de
 *     vencimiento. Sin ellos, rechazo 3251.
 *
 * Devuelve un array cuando hay cuotas: en UBL `cac:PaymentTerms` se repite, y
 * xmlbuilder2 convierte un array en elementos hermanos con el mismo nombre. Un
 * objeto solo podría llevar un nodo.
 */
function bloquePaymentTerms(doc: Comprobante) {
  const { moneda } = doc;
  const forma = doc.formaPago ?? { tipo: "contado" as const };

  if (forma.tipo === "contado") {
    return { "cbc:ID": "FormaPago", "cbc:PaymentMeansID": "Contado" };
  }

  return [
    {
      "cbc:ID": "FormaPago",
      "cbc:PaymentMeansID": "Credito",
      "cbc:Amount": { "@currencyID": moneda, "#": n(forma.pendiente) },
    },
    ...forma.cuotas.map((c) => ({
      "cbc:ID": "FormaPago",
      // Cuota001, Cuota002… El formato de tres dígitos lo exige el catálogo.
      "cbc:PaymentMeansID": `Cuota${String(c.numero).padStart(3, "0")}`,
      "cbc:Amount": { "@currencyID": moneda, "#": n(c.monto) },
      "cbc:PaymentDueDate": c.vencimiento,
    })),
  ];
}

/**
 * Genera el XML UBL 2.1 (sin firmar) de una factura o boleta.
 * Devuelve el XML como string con el ext:ExtensionContent vacío listo para firma.
 */
export function generarFacturaXml(doc: Comprobante): string {
  const { emisor, receptor, totales, moneda, tasaIgv } = doc;

  const invoice = {
    Invoice: {
      ...namespaces(INVOICE_NS),
      "ext:UBLExtensions": {
        "ext:UBLExtension": { "ext:ExtensionContent": {} },
      },
      "cbc:UBLVersionID": "2.1",
      "cbc:CustomizationID": "2.0",
      "cbc:ID": `${doc.serie}-${doc.correlativo}`,
      "cbc:IssueDate": fecha(doc.fechaEmision),
      "cbc:IssueTime": hora(doc.fechaEmision),
      "cbc:InvoiceTypeCode": {
        "@listID": TIPO_OPERACION_VENTA,
        "@name": "Tipo de Operacion",
        "@listAgencyName": "PE:SUNAT",
        "@listName": "Tipo de Documento",
        "@listURI": CAT01_URI,
        "@listSchemeURI": CAT51_URI,
        "#": doc.tipoDocumento,
      },
      // Leyenda obligatoria: monto total en letras (catálogo 52, código 1000).
      "cbc:Note": {
        "@languageLocaleID": "1000",
        $: montoEnLetras(totales.total, moneda === "PEN" ? "SOLES" : moneda),
      },
      "cbc:DocumentCurrencyCode": moneda,
      "cac:Signature": bloqueFirma(emisor.ruc, emisor.razonSocial),
      "cac:AccountingSupplierParty": bloqueEmisor(emisor),
      "cac:AccountingCustomerParty": bloqueReceptor(receptor),
      // Forma de pago (obligatorio desde 2022). Es el "tipo de transacción" que
      // exige SUNAT: error 3244 si falta, 3251 si dice crédito sin cronograma.
      "cac:PaymentTerms": bloquePaymentTerms(doc),
      "cac:TaxTotal": bloqueTaxTotal(moneda, totales),
      "cac:LegalMonetaryTotal": {
        "cbc:LineExtensionAmount": {
          "@currencyID": moneda,
          "#": n(valorVentaTotal(totales)),
        },
        "cbc:TaxInclusiveAmount": {
          "@currencyID": moneda,
          "#": n(totales.total),
        },
        "cbc:PayableAmount": { "@currencyID": moneda, "#": n(totales.total) },
      },
      "cac:InvoiceLine": doc.items.map((it, i) =>
        contenidoLinea(it, i + 1, moneda, tasaIgv, "cbc:InvoicedQuantity"),
      ),
    },
  };

  return create({ encoding: "UTF-8" }, invoice).end({ prettyPrint: false });
}
