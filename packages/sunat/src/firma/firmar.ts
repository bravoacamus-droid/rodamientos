/**
 * Firma XML-DSig del comprobante, según lo que exige SUNAT.
 *
 * Parámetros verificados contra el firmador oficial de Greenter (Sunat\SignedXml):
 *   - Firma  : RSA-SHA1   (SUNAT sigue en SHA1, no SHA256)
 *   - Digest : SHA1
 *   - C14N   : http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 *   - Transform: enveloped-signature
 *   - Reference URI="" (todo el documento), firma "enveloped"
 *   - La firma se inyecta DENTRO del primer <ext:ExtensionContent> vacío.
 *   - KeyInfo lleva el certificado X509 en base64.
 *
 * Implementado con xml-crypto (v6). No usa OpenSSL del sistema.
 */
import { SignedXml } from "xml-crypto";
import { leerCertificadoPfx } from "./certificado";
import type { ComprobanteFirmado } from "../dominio/index";
import forge from "node-forge";

const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const EXT_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";

export interface OpcionesFirma {
  /** Certificado .pfx/.p12 en binario. */
  certificadoPfx: Buffer;
  /** Contraseña del certificado. */
  certificadoClave: string;
}

/**
 * Firma un XML UBL 2.1 e inserta la firma dentro de ext:ExtensionContent.
 * @param xmlSinFirmar XML generado por el módulo ubl/
 * @param nombre nombre del documento (RUC-tipo-serie-correlativo), para el resultado
 */
export function firmarXml(
  xmlSinFirmar: string,
  nombre: string,
  opciones: OpcionesFirma,
): ComprobanteFirmado {
  const { privateKeyPem, certificateBase64 } = leerCertificadoPfx(
    opciones.certificadoPfx,
    opciones.certificadoClave,
  );

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
    // KeyInfo con el certificado X509. Debe llevar el prefijo ds: para quedar en
    // el namespace xmldsig; sin él, SUNAT no reconoce el firmante
    // ("Unsupported or unrecognized Signature signer format").
    getKeyInfoContent: () =>
      `<ds:X509Data><ds:X509Certificate>${certificateBase64}</ds:X509Certificate></ds:X509Data>`,
  });

  // Reference al documento completo (URI="") con transform enveloped + digest SHA1.
  sig.addReference({
    xpath: "/*",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
    uri: "",
    isEmptyUri: true,
  });

  // La firma va dentro del ExtensionContent vacío (namespace ext).
  sig.computeSignature(xmlSinFirmar, {
    prefix: "ds",
    location: {
      reference: `//*[local-name(.)='ExtensionContent']`,
      action: "append",
    },
  });

  const xmlFirmado = sig.getSignedXml();

  // Hash del documento firmado (el DigestValue de la firma), para el campo `hash`.
  const digest = extraerDigestValue(xmlFirmado);

  return { nombre, xmlFirmado, hash: digest };
}

/** Extrae el DigestValue de la firma (lo que SUNAT y la BD usan como hash). */
function extraerDigestValue(xmlFirmado: string): string {
  const m = xmlFirmado.match(
    /<ds:DigestValue>([^<]*)<\/ds:DigestValue>/,
  );
  return m?.[1] ?? "";
}

// Reexport para que el índice del paquete lo tenga a mano.
export { leerCertificadoPfx };
export type { CertificadoPem } from "./certificado";
export { forge };
