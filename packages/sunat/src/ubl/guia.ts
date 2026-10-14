/**
 * Generación del XML UBL 2.1 de la guía de remisión electrónica remitente (09).
 *
 * La raíz es DespatchAdvice, no Invoice: una guía documenta un TRASLADO, no una
 * venta. No lleva importes ni impuestos; lleva origen, destino, transporte y la
 * relación de bienes.
 *
 * El orden de los elementos importa: SUNAT valida contra el XSD y rechaza si
 * uno va fuera de secuencia. Igual que en factura.ts, el ext:ExtensionContent
 * queda vacío para que lo rellene el módulo de firma.
 *
 * Reescrito el 15/10 contra la plantilla `despatch2022.xml.twig` de Greenter
 * —la que usan en producción quienes ya emiten GRE— y el Anexo N.° 14. La
 * versión anterior tenía los nueve fallos que listó `docs/INVESTIGACION-GRE.md`
 * §8.3: la descripción del motivo en `Information` (que es el sustento del
 * peso), `Item/Name` en vez de `Description`, un `SplitConsignmentIndicator`
 * que el XSD no prevé, los identificadores sin sus atributos de catálogo…
 *
 * SIGUE SIN VALIDAR CONTRA SUNAT: no hay ambiente de pruebas oficial para la
 * GRE y faltan las credenciales del cliente. El primer envío real lo dirá.
 */
import { create } from "xmlbuilder2";
import type { GuiaRemision } from "../dominio/guia";
import { fecha, hora, bloqueFirma } from "./comun";

const DESPATCH_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2";
const CATALOGO = (n: string) => `urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo${n}`;

/** Un documento de identidad con los atributos del catálogo 06. */
function idDocumento(tipoDoc: string, numero: string) {
  return {
    "@schemeID": tipoDoc,
    "@schemeName": "Documento de Identidad",
    "@schemeAgencyName": "PE:SUNAT",
    "@schemeURI": CATALOGO("06"),
    "#": numero,
  };
}

/** Parte (remitente o destinatario) con su documento y razón social. */
function bloqueParte(tipoDoc: string, numero: string, razonSocial: string) {
  return {
    "cac:PartyIdentification": { "cbc:ID": idDocumento(tipoDoc, numero) },
    "cac:PartyLegalEntity": { "cbc:RegistrationName": { $: razonSocial } },
  };
}

/**
 * Dirección de un punto del traslado.
 *
 * El ubigeo va en cbc:ID con los atributos de esquema del INEI: SUNAT lo valida
 * contra su tabla y rechaza la guía si no corresponde a un distrito real. El
 * código de establecimiento lleva el RUC al que pertenece en `@listID`.
 */
function bloqueDireccion(
  p: { ubigeo: string; direccion: string; codigoEstablecimiento?: string },
  ruc: string,
) {
  return {
    "cbc:ID": { "@schemeAgencyName": "PE:INEI", "@schemeName": "Ubigeos", "#": p.ubigeo },
    ...(p.codigoEstablecimiento
      ? { "cbc:AddressTypeCode": { "@listID": ruc, "#": p.codigoEstablecimiento } }
      : {}),
    "cac:AddressLine": { "cbc:Line": { $: p.direccion } },
  };
}

/** Genera el XML (sin firmar) de una guía de remisión. */
export function generarGuiaXml(doc: GuiaRemision): string {
  const esPublico = doc.modalidad === "01";

  // Etapa del traslado: en público, el transportista; en privado, el
  // conductor. El orden dentro de ShipmentStage es el del XSD.
  const etapa: Record<string, unknown> = {
    "cbc:TransportModeCode": {
      "@listName": "Modalidad de traslado",
      "@listAgencyName": "PE:SUNAT",
      "@listURI": CATALOGO("18"),
      "#": doc.modalidad,
    },
    "cac:TransitPeriod": { "cbc:StartDate": fecha(doc.fechaInicioTraslado) },
  };
  if (esPublico && doc.transportista) {
    etapa["cac:CarrierParty"] = {
      "cac:PartyIdentification": { "cbc:ID": { "@schemeID": "6", "#": doc.transportista.ruc } },
      "cac:PartyLegalEntity": {
        "cbc:RegistrationName": { $: doc.transportista.razonSocial },
        ...(doc.transportista.registroMtc ? { "cbc:CompanyID": doc.transportista.registroMtc } : {}),
      },
    };
  }
  if (!esPublico && doc.conductor) {
    etapa["cac:DriverPerson"] = {
      "cbc:ID": idDocumento(doc.conductor.tipoDoc, doc.conductor.numDoc),
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
      "@listURI": CATALOGO("20"),
      "#": doc.motivo,
    },
    ...(doc.descripcionMotivo ? { "cbc:HandlingInstructions": { $: doc.descripcionMotivo } } : {}),
    "cbc:GrossWeightMeasure": { "@unitCode": doc.unidadPeso, "#": doc.pesoTotal.toFixed(3) },
    ...(doc.numeroBultos && doc.numeroBultos > 0
      ? { "cbc:TotalTransportHandlingUnitQuantity": doc.numeroBultos }
      : {}),
    ...(doc.indicadores && doc.indicadores.length > 0
      ? { "cbc:SpecialInstructions": doc.indicadores }
      : {}),
    "cac:ShipmentStage": etapa,
    "cac:Delivery": {
      "cac:DeliveryAddress": bloqueDireccion(doc.puntoLlegada, doc.destinatario.numDoc),
      "cac:Despatch": { "cac:DespatchAddress": bloqueDireccion(doc.puntoPartida, doc.emisor.ruc) },
    },
    // El vehículo no depende de la modalidad en el anexo: va si lo hay.
    ...(doc.vehiculo
      ? {
          "cac:TransportHandlingUnit": {
            "cac:TransportEquipment": {
              "cbc:ID": doc.vehiculo.placa,
              ...(doc.vehiculo.certificado
                ? { "cac:ApplicableTransportMeans": { "cbc:RegistrationNationalityID": doc.vehiculo.certificado } }
                : {}),
            },
          },
        }
      : {}),
  };

  const lineas = doc.items.map((it, i) => ({
    "cbc:ID": i + 1,
    "cbc:DeliveredQuantity": { "@unitCode": it.unidad, "#": Number(it.cantidad.toFixed(10)).toString() },
    "cac:OrderLineReference": { "cbc:LineID": i + 1 },
    "cac:Item": {
      "cbc:Description": { $: it.descripcion },
      ...(it.codigoProducto ? { "cac:SellersItemIdentification": { "cbc:ID": it.codigoProducto } } : {}),
    },
  }));

  const relacionados = (doc.documentosRelacionados ?? []).map((r) => ({
    "cbc:ID": r.numero,
    "cbc:DocumentTypeCode": {
      "@listAgencyName": "PE:SUNAT",
      "@listName": "Documento relacionado al transporte",
      "@listURI": CATALOGO("61"),
      "#": r.tipoDocumento,
    },
    "cbc:DocumentType": r.descripcion,
    ...(r.emisorRuc
      ? { "cac:IssuerParty": { "cac:PartyIdentification": { "cbc:ID": idDocumento("6", r.emisorRuc) } } }
      : {}),
  }));

  const cuerpo: Record<string, unknown> = {
    "@xmlns": DESPATCH_NS,
    "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
    "@xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "@xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "@xmlns:ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "ext:UBLExtensions": { "ext:UBLExtension": { "ext:ExtensionContent": {} } },
    "cbc:UBLVersionID": "2.1",
    "cbc:CustomizationID": "2.0",
    "cbc:ID": `${doc.serie}-${doc.correlativo}`,
    "cbc:IssueDate": fecha(doc.fechaEmision),
    "cbc:IssueTime": hora(doc.fechaEmision),
    "cbc:DespatchAdviceTypeCode": {
      "@listAgencyName": "PE:SUNAT",
      "@listName": "Tipo de Documento",
      "@listURI": CATALOGO("01"),
      "#": doc.tipoDocumento,
    },
    ...(doc.observaciones ? { "cbc:Note": { $: doc.observaciones } } : {}),
    ...(relacionados.length > 0 ? { "cac:AdditionalDocumentReference": relacionados } : {}),
    "cac:Signature": bloqueFirma(doc.emisor.ruc, doc.emisor.razonSocial),
    "cac:DespatchSupplierParty": { "cac:Party": bloqueParte("6", doc.emisor.ruc, doc.emisor.razonSocial) },
    "cac:DeliveryCustomerParty": {
      "cac:Party": bloqueParte(doc.destinatario.tipoDoc, doc.destinatario.numDoc, doc.destinatario.razonSocial),
    },
    "cac:Shipment": envio,
    "cac:DespatchLine": lineas,
  };

  return create({ encoding: "UTF-8" }, { DespatchAdvice: cuerpo }).end({ prettyPrint: false });
}
