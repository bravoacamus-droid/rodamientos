/**
 * Generación del XML UBL 2.1 de la guía de remisión electrónica (GRE).
 *
 * La raíz es DespatchAdvice, no Invoice: una guía documenta un TRASLADO, no una
 * venta. No lleva importes ni impuestos; lleva origen, destino, transporte y la
 * relación de bienes.
 *
 * El orden de los elementos importa: SUNAT valida contra el XSD y rechaza si
 * uno va fuera de secuencia. Igual que en factura.ts, el ext:ExtensionContent
 * queda vacío para que lo rellene el módulo de firma.
 *
 * PENDIENTE DE VALIDACIÓN CONTRA SUNAT. A diferencia de factura, nota, resumen
 * y baja —que se probaron contra el servidor real hasta obtener CDR—, esta
 * estructura todavía no se ha enviado: la GRE va por una API REST distinta que
 * necesita credenciales que el cliente aún no ha entregado. Está escrita
 * siguiendo la especificación, pero hasta que SUNAT la acepte hay que darla por
 * no verificada.
 */
import { create } from "xmlbuilder2";
import type { GuiaRemision } from "../dominio/guia";
import { fecha, hora, bloqueFirma } from "./comun";

const DESPATCH_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2";
const CAT01_URI = "urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01";

/** Parte (emisor o destinatario) con su documento de identidad. */
function bloqueParte(ruc: string, razonSocial: string, tipoDoc = "6") {
  return {
    "cac:PartyIdentification": {
      "cbc:ID": { "@schemeID": tipoDoc, "#": ruc },
    },
    "cac:PartyLegalEntity": {
      "cbc:RegistrationName": { $: razonSocial },
    },
  };
}

/**
 * Dirección de un punto del traslado.
 *
 * El ubigeo va en cbc:ID con los atributos de esquema del INEI: SUNAT lo valida
 * contra su tabla y rechaza la guía si no corresponde a un distrito real.
 */
function bloqueDireccion(p: {
  ubigeo: string;
  direccion: string;
  codigoEstablecimiento?: string;
}) {
  return {
    "cbc:ID": {
      "@schemeAgencyName": "PE:INEI",
      "@schemeName": "Ubigeos",
      "#": p.ubigeo,
    },
    ...(p.codigoEstablecimiento
      ? { "cbc:AddressTypeCode": p.codigoEstablecimiento }
      : {}),
    "cac:AddressLine": { "cbc:Line": { $: p.direccion } },
  };
}

/** Genera el XML (sin firmar) de una guía de remisión. */
export function generarGuiaXml(doc: GuiaRemision): string {
  const esPublico = doc.modalidad === "01";

  // Etapa del traslado: quién lo hace. En público va el transportista; en
  // privado, el conductor. SUNAT rechaza si se manda el que no toca.
  const etapa: Record<string, unknown> = {
    "cbc:TransportModeCode": doc.modalidad,
    "cac:TransitPeriod": {
      "cbc:StartDate": fecha(doc.fechaInicioTraslado),
    },
  };
  if (esPublico && doc.transportista) {
    etapa["cac:CarrierParty"] = {
      "cac:PartyIdentification": {
        "cbc:ID": { "@schemeID": "6", "#": doc.transportista.ruc },
      },
      "cac:PartyLegalEntity": {
        "cbc:RegistrationName": { $: doc.transportista.razonSocial },
      },
    };
  }
  if (!esPublico && doc.conductor) {
    etapa["cac:DriverPerson"] = {
      "cbc:ID": { "@schemeID": doc.conductor.tipoDoc, "#": doc.conductor.numDoc },
      "cbc:FirstName": { $: doc.conductor.nombres },
      "cbc:FamilyName": { $: doc.conductor.apellidos },
      "cbc:JobTitle": "Principal",
      "cac:IdentityDocumentReference": { "cbc:ID": doc.conductor.licencia },
    };
  }

  const envio: Record<string, unknown> = {
    "cbc:ID": "SUNAT_Envio",
    "cbc:HandlingCode": {
      "@listAgencyName": "PE:SUNAT",
      "@listName": "Motivo de traslado",
      "@listURI": "urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20",
      "#": doc.motivo,
    },
    ...(doc.descripcionMotivo
      ? { "cbc:Information": { $: doc.descripcionMotivo } }
      : {}),
    "cbc:GrossWeightMeasure": {
      "@unitCode": doc.unidadPeso,
      "#": doc.pesoTotal,
    },
    "cbc:SplitConsignmentIndicator": doc.envioParcial ? "true" : "false",
    "cac:ShipmentStage": etapa,
    "cac:Delivery": {
      "cac:DeliveryAddress": bloqueDireccion(doc.puntoLlegada),
      "cac:Despatch": {
        "cac:DespatchAddress": bloqueDireccion(doc.puntoPartida),
      },
    },
  };

  if (!esPublico && doc.vehiculo) {
    envio["cac:TransportHandlingUnit"] = {
      "cac:TransportEquipment": {
        "cbc:ID": doc.vehiculo.placa,
        ...(doc.vehiculo.certificado
          ? {
              "cac:ApplicableTransportMeans": {
                "cbc:RegistrationNationalityID": doc.vehiculo.certificado,
              },
            }
          : {}),
      },
    };
  }

  const lineas = doc.items.map((it, i) => ({
    "cbc:ID": i + 1,
    "cbc:DeliveredQuantity": { "@unitCode": it.unidad, "#": it.cantidad },
    "cac:OrderLineReference": { "cbc:LineID": i + 1 },
    "cac:Item": {
      "cbc:Name": { $: it.descripcion },
      ...(it.codigoProducto
        ? {
            "cac:SellersItemIdentification": { "cbc:ID": it.codigoProducto },
          }
        : {}),
    },
  }));

  const cuerpo: Record<string, unknown> = {
    "@xmlns": DESPATCH_NS,
    "@xmlns:cac":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "@xmlns:cbc":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
    "@xmlns:ext":
      "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "ext:UBLExtensions": {
      "ext:UBLExtension": { "ext:ExtensionContent": {} },
    },
    "cbc:UBLVersionID": "2.1",
    "cbc:CustomizationID": "2.0",
    "cbc:ID": `${doc.serie}-${doc.correlativo}`,
    "cbc:IssueDate": fecha(doc.fechaEmision),
    "cbc:IssueTime": hora(doc.fechaEmision),
    "cbc:DespatchAdviceTypeCode": {
      "@listAgencyName": "PE:SUNAT",
      "@listName": "Tipo de Documento",
      "@listURI": CAT01_URI,
      "#": doc.tipoDocumento,
    },
    ...(doc.observaciones ? { "cbc:Note": { $: doc.observaciones } } : {}),
    "cac:Signature": bloqueFirma(doc.emisor.ruc, doc.emisor.razonSocial),
    "cac:DespatchSupplierParty": {
      "cac:Party": bloqueParte(doc.emisor.ruc, doc.emisor.razonSocial),
    },
    "cac:DeliveryCustomerParty": {
      "cac:Party": bloqueParte(
        doc.destinatario.numDoc,
        doc.destinatario.razonSocial,
        doc.destinatario.tipoDoc,
      ),
    },
    ...(doc.documentoRelacionado
      ? {
          "cac:AdditionalDocumentReference": {
            "cbc:ID": doc.documentoRelacionado.numero,
            "cbc:DocumentTypeCode": doc.documentoRelacionado.tipoDocumento,
          },
        }
      : {}),
    "cac:Shipment": envio,
    "cac:DespatchLine": lineas,
  };

  return create({ encoding: "UTF-8" }, { DespatchAdvice: cuerpo }).end({
    prettyPrint: false,
  });
}
