/**
 * Utilidades compartidas por los generadores UBL (factura, boleta, notas).
 * El contenido de una línea es idéntico entre comprobantes: solo cambia el
 * nombre del elemento de cantidad (InvoicedQuantity / CreditedQuantity /
 * DebitedQuantity), que se pasa como parámetro.
 */
import type { ItemComprobante, Totales } from "../dominio/index";
import { AFECTACION_IGV } from "../catalogos/index";

/** Namespaces comunes; el namespace por defecto depende del tipo de raíz. */
export function namespaces(defaultNs: string) {
  return {
    "@xmlns": defaultNs,
    "@xmlns:cac":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "@xmlns:cbc":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
    "@xmlns:ext":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  };
}

/** Dos decimales fijos, como espera SUNAT. */
export function n(v: number): string {
  return v.toFixed(2);
}

/** Valores unitarios con hasta 10 decimales, sin ceros de relleno. */
export function n10(v: number): string {
  return Number(v.toFixed(10)).toString();
}

/**
 * Fecha y hora SIEMPRE en horario de Perú, no en UTC.
 *
 * SUNAT compara la fecha de emisión contra su propio reloj (Lima, UTC-5 todo el
 * año). Formatear con toISOString() usa UTC: cualquier emisión posterior a las
 * 19:00 de Lima saldría fechada al día siguiente y SUNAT la observa o rechaza.
 */
const ZONA_PERU = "America/Lima";
// en-CA produce AAAA-MM-DD, que es justo el formato de UBL.
const FMT_FECHA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_PERU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const FMT_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_PERU,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function fecha(d: Date): string {
  return FMT_FECHA.format(d);
}
export function hora(d: Date): string {
  return FMT_HORA.format(d);
}

/** TaxScheme según la afectación del IGV de la línea. */
export function tributoDeAfectacion(afect: string): {
  id: string;
  name: string;
  code: string;
} {
  switch (afect) {
    case AFECTACION_IGV.GRAVADO:
      return { id: "1000", name: "IGV", code: "VAT" };
    case AFECTACION_IGV.EXONERADO:
      return { id: "9997", name: "EXO", code: "VAT" };
    case AFECTACION_IGV.INAFECTO:
      return { id: "9998", name: "INA", code: "FRE" };
    case AFECTACION_IGV.EXPORTACION:
      return { id: "9995", name: "EXP", code: "FRE" };
    default:
      return { id: "1000", name: "IGV", code: "VAT" };
  }
}

/** Bloque cac:Signature del emisor (idéntico en todos los comprobantes). */
export function bloqueFirma(ruc: string, razonSocial: string) {
  return {
    "cbc:ID": `SIGN${ruc}`,
    "cac:SignatoryParty": {
      "cac:PartyIdentification": { "cbc:ID": ruc },
      "cac:PartyName": { "cbc:Name": { $: razonSocial } },
    },
    "cac:DigitalSignatureAttachment": {
      "cac:ExternalReference": { "cbc:URI": "#SIGN-RODATECH" },
    },
  };
}

/**
 * Contenido de una línea. `nombreCantidad` es el elemento de cantidad propio
 * de cada comprobante: "cbc:InvoicedQuantity", "cbc:CreditedQuantity" o
 * "cbc:DebitedQuantity".
 */
export function contenidoLinea(
  item: ItemComprobante,
  indice: number,
  moneda: string,
  tasaIgv: number,
  nombreCantidad: string,
): Record<string, unknown> {
  const afect = tributoDeAfectacion(item.afectacionIgv);
  return {
    "cbc:ID": indice,
    [nombreCantidad]: { "@unitCode": item.unidad, "#": item.cantidad },
    "cbc:LineExtensionAmount": {
      "@currencyID": moneda,
      "#": n(item.valorVenta),
    },
    "cac:PricingReference": {
      "cac:AlternativeConditionPrice": {
        "cbc:PriceAmount": {
          "@currencyID": moneda,
          "#": n10(item.precioUnitario),
        },
        "cbc:PriceTypeCode": "01",
      },
    },
    "cac:TaxTotal": {
      "cbc:TaxAmount": { "@currencyID": moneda, "#": n(item.igv) },
      "cac:TaxSubtotal": {
        "cbc:TaxableAmount": { "@currencyID": moneda, "#": n(item.valorVenta) },
        "cbc:TaxAmount": { "@currencyID": moneda, "#": n(item.igv) },
        "cac:TaxCategory": {
          "cbc:Percent":
            item.afectacionIgv === AFECTACION_IGV.GRAVADO ? tasaIgv : 0,
          "cbc:TaxExemptionReasonCode": item.afectacionIgv,
          "cac:TaxScheme": {
            "cbc:ID": afect.id,
            "cbc:Name": afect.name,
            "cbc:TaxTypeCode": afect.code,
          },
        },
      },
    },
    "cac:Item": {
      "cbc:Description": { $: item.descripcion },
      ...(item.codigoProducto
        ? { "cac:SellersItemIdentification": { "cbc:ID": item.codigoProducto } }
        : {}),
      // Código de producto SUNAT (catálogo 25 / UNSPSC). Opcional: solo viaja
      // si el producto lo tiene configurado. El orden importa —
      // SellersItemIdentification va antes que CommodityClassification en el
      // XSD de UBL, y SUNAT valida contra el esquema.
      ...(item.codigoSunat
        ? {
            "cac:CommodityClassification": {
              "cbc:ItemClassificationCode": {
                "@listID": "UNSPSC",
                "@listAgencyName": "GS1 US",
                "@listName": "Item Classification",
                "#": item.codigoSunat,
              },
            },
          }
        : {}),
    },
    "cac:Price": {
      "cbc:PriceAmount": {
        "@currencyID": moneda,
        "#": n10(item.valorUnitario),
      },
    },
  };
}

/**
 * Bloque cac:TaxTotal del total del comprobante.
 *
 * Un comprobante puede mezclar operaciones gravadas, exoneradas e inafectas
 * (una funda con IGV y un libro exonerado en la misma boleta). Cada tipo va en
 * su propio TaxSubtotal con su tributo del catálogo 05, y solo la gravada
 * lleva IGV: si se declarara todo bajo 1000/IGV, SUNAT cobraría impuesto sobre
 * lo exonerado.
 */
export function bloqueTaxTotal(moneda: string, totales: Totales) {
  const gravadas = totales.gravadas ?? 0;
  const exoneradas = totales.exoneradas ?? 0;
  const inafectas = totales.inafectas ?? 0;

  const subtotal = (
    base: number,
    impuesto: number,
    id: string,
    name: string,
    code: string,
  ) => ({
    "cbc:TaxableAmount": { "@currencyID": moneda, "#": n(base) },
    "cbc:TaxAmount": { "@currencyID": moneda, "#": n(impuesto) },
    "cac:TaxCategory": {
      "cac:TaxScheme": {
        "cbc:ID": id,
        "cbc:Name": name,
        "cbc:TaxTypeCode": code,
      },
    },
  });

  const subtotales: ReturnType<typeof subtotal>[] = [];
  // La gravada va siempre que haya algo gravado; si el comprobante fuera todo
  // exonerado/inafecto se omite en vez de declarar una base 0 con IGV 0.
  if (gravadas > 0 || (exoneradas === 0 && inafectas === 0)) {
    subtotales.push(subtotal(gravadas, totales.igv, "1000", "IGV", "VAT"));
  }
  if (exoneradas > 0) {
    subtotales.push(subtotal(exoneradas, 0, "9997", "EXO", "VAT"));
  }
  if (inafectas > 0) {
    subtotales.push(subtotal(inafectas, 0, "9998", "INA", "FRE"));
  }

  return {
    "cbc:TaxAmount": { "@currencyID": moneda, "#": n(totales.igv) },
    "cac:TaxSubtotal": subtotales,
  };
}

/**
 * Total del valor de venta: gravadas + exoneradas + inafectas.
 * Es lo que va en cbc:LineExtensionAmount, y debe cuadrar con la suma de los
 * LineExtensionAmount de las líneas.
 */
export function valorVentaTotal(totales: Totales): number {
  return Number(
    (
      (totales.gravadas ?? 0) +
      (totales.exoneradas ?? 0) +
      (totales.inafectas ?? 0)
    ).toFixed(2),
  );
}

/** Bloque cac:Party del emisor (AccountingSupplierParty). */
export function bloqueEmisor(emisor: {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  ubigeo: string;
  provincia?: string;
  departamento?: string;
  distrito?: string;
  direccion: string;
}) {
  return {
    "cac:Party": {
      "cac:PartyIdentification": {
        "cbc:ID": { "@schemeID": "6", "#": emisor.ruc },
      },
      ...(emisor.nombreComercial
        ? { "cac:PartyName": { "cbc:Name": { $: emisor.nombreComercial } } }
        : {}),
      "cac:PartyLegalEntity": {
        "cbc:RegistrationName": { $: emisor.razonSocial },
        "cac:RegistrationAddress": {
          "cbc:ID": emisor.ubigeo,
          "cbc:AddressTypeCode": "0000",
          "cbc:CityName": emisor.provincia ?? "",
          "cbc:CountrySubentity": emisor.departamento ?? "",
          "cbc:District": emisor.distrito ?? "",
          "cac:AddressLine": { "cbc:Line": { $: emisor.direccion } },
          "cac:Country": { "cbc:IdentificationCode": "PE" },
        },
      },
    },
  };
}

/** Bloque cac:Party del receptor (AccountingCustomerParty). */
export function bloqueReceptor(receptor: {
  tipoDoc: string;
  numDoc: string;
  razonSocial: string;
  direccion?: string;
}) {
  return {
    "cac:Party": {
      "cac:PartyIdentification": {
        "cbc:ID": { "@schemeID": receptor.tipoDoc, "#": receptor.numDoc },
      },
      "cac:PartyLegalEntity": {
        "cbc:RegistrationName": { $: receptor.razonSocial },
        ...(receptor.direccion
          ? {
              "cac:RegistrationAddress": {
                "cac:AddressLine": { "cbc:Line": { $: receptor.direccion } },
              },
            }
          : {}),
      },
    },
  };
}
