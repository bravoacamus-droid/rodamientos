/**
 * Lectura del certificado digital (.pfx / .p12) del emisor.
 *
 * Extrae la clave privada y el certificado X509 en formato PEM, que es lo que
 * consume el firmador. Usa node-forge (PKCS#12) — no dependemos de OpenSSL en el
 * sistema, así funciona igual en el servidor o en una función serverless.
 */
import forge from "node-forge";

export interface CertificadoPem {
  /** Clave privada en PEM (para firmar). */
  privateKeyPem: string;
  /** Certificado X509 en PEM (para KeyInfo). */
  certificatePem: string;
  /** Certificado en base64 sin cabeceras PEM (para el nodo X509Certificate). */
  certificateBase64: string;
}

/**
 * Resuelve un OID por su nombre en la tabla de node-forge.
 *
 * La tabla está tipada como índice abierto, así que el acceso devuelve
 * `string | undefined` y no sirve como clave de otro índice. Estos dos OID
 * siempre existen; si alguna vez faltaran sería un cambio incompatible de
 * node-forge, y es mejor enterarse aquí que producir una firma inválida.
 */
function oid(nombre: "pkcs8ShroudedKeyBag" | "certBag"): string {
  const valor = forge.pki.oids[nombre];
  if (!valor) {
    throw new Error(`node-forge no define el OID ${nombre}.`);
  }
  return valor;
}

/**
 * Abre un .pfx/.p12 y devuelve la clave privada y el certificado en PEM.
 * @param pfx contenido binario del certificado
 * @param clave contraseña del certificado
 */
export function leerCertificadoPfx(
  pfx: Buffer,
  clave: string,
): CertificadoPem {
  const der = forge.util.createBuffer(pfx.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);

  // Clave privada
  const oidClave = oid("pkcs8ShroudedKeyBag");
  const keyBags = p12.getBags({ bagType: oidClave });
  const keyBag = keyBags[oidClave]?.[0];
  const key = keyBag?.key;
  if (!key) {
    throw new Error(
      "No se encontró la clave privada en el certificado (¿contraseña incorrecta?).",
    );
  }

  // Certificado
  const oidCert = oid("certBag");
  const certBags = p12.getBags({ bagType: oidCert });
  const certBag = certBags[oidCert]?.[0];
  const cert = certBag?.cert;
  if (!cert) {
    throw new Error("No se encontró el certificado X509 en el archivo.");
  }

  const privateKeyPem = forge.pki.privateKeyToPem(key);
  const certificatePem = forge.pki.certificateToPem(cert);
  // base64 del DER del certificado, para el nodo <ds:X509Certificate>
  const certDer = forge.asn1
    .toDer(forge.pki.certificateToAsn1(cert))
    .getBytes();
  const certificateBase64 = forge.util.encode64(certDer);

  return { privateKeyPem, certificatePem, certificateBase64 };
}
