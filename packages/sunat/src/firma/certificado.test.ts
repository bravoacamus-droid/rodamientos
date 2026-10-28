/**
 * El certificado del titular, de punta a punta (auditoría SUNAT 28/10, B2/B3).
 *
 * Los .pfx se fabrican aquí con node-forge —una CA raíz, una intermedia y la
 * hoja de la empresa—, como los que entrega una entidad certificadora. Ninguno
 * sale del test: no hay archivos ni claves de verdad.
 */
import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

import {
  ErrorCertificado,
  datosCertificado,
  leerCertificadoPfx,
  problemasCertificado,
  rucValido,
} from "./certificado";
import { firmarXml } from "./firmar";

const RUC = "20562681206";
const OTRO_RUC = "20553510661";
const CLAVE = "clave-de-prueba";

type Atributos = forge.pki.CertificateField[];

interface Par {
  key: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

function emitir(
  sujeto: Atributos,
  emisor: Par | null,
  opciones: { ca: boolean; desde: Date; hasta: Date; serie: string },
): Par {
  const llaves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = opciones.serie;
  cert.validity.notBefore = opciones.desde;
  cert.validity.notAfter = opciones.hasta;
  cert.setSubject(sujeto);
  cert.setIssuer(emisor ? emisor.cert.subject.attributes : sujeto);
  cert.setExtensions([{ name: "basicConstraints", cA: opciones.ca }]);
  cert.sign(emisor ? emisor.key : llaves.privateKey, forge.md.sha256.create());
  return { key: llaves.privateKey, cert };
}

const HOY = new Date("2026-10-28T15:00:00Z");
const HACE_UN_ANO = new Date("2025-10-28T00:00:00Z");
const EN_UN_ANO = new Date("2027-10-28T00:00:00Z");

const raiz = emitir(
  [
    { shortName: "CN", value: "RAIZ DE PRUEBA" },
    { shortName: "O", value: "ENTIDAD DE PRUEBA" },
  ],
  null,
  { ca: true, desde: HACE_UN_ANO, hasta: new Date("2036-01-01T00:00:00Z"), serie: "01" },
);
const intermedia = emitir(
  [
    { shortName: "CN", value: "INTERMEDIA DE PRUEBA" },
    // El RUC de la ENTIDAD en su propio sujeto: no tiene que confundirse con
    // el del titular, que es el que se busca.
    { shortName: "OU", value: OTRO_RUC },
  ],
  raiz,
  { ca: true, desde: HACE_UN_ANO, hasta: new Date("2031-01-01T00:00:00Z"), serie: "02" },
);

function hoja(sujeto: Atributos, desde = HACE_UN_ANO, hasta = EN_UN_ANO): Par {
  return emitir(sujeto, intermedia, { ca: false, desde, hasta, serie: "03" });
}

/** El .pfx con la llave de la hoja y los certificados en el orden dado. */
function pfx(llave: forge.pki.rsa.PrivateKey, certs: forge.pki.Certificate[], clave = CLAVE): Buffer {
  const asn1 = forge.pkcs12.toPkcs12Asn1(llave, certs, clave, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

const EMPRESA: Atributos = [
  { shortName: "CN", value: "INVERSIONES RODATECH E.I.R.L." },
  { shortName: "OU", value: RUC },
  { shortName: "O", value: "INVERSIONES RODATECH E.I.R.L." },
  { shortName: "C", value: "PE" },
];

const buena = hoja(EMPRESA);
// Orden INVERSO: la raíz y la intermedia delante. Es el caso que rompía la
// firma: se tomaba el primero.
const pfxCadena = pfx(buena.key, [raiz.cert, intermedia.cert, buena.cert]);

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions><cbc:ID>F001-1</cbc:ID></Invoice>`;

function base64(cert: forge.pki.Certificate): string {
  return forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
}

describe("leerCertificadoPfx", () => {
  it("elige la hoja aunque la cadena venga delante", () => {
    // Que el archivo de verdad trae la raíz PRIMERO: si no, la prueba no
    // distinguiría el código de antes (tomaba el primero) del de ahora.
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxCadena.toString("binary")), CLAVE);
    const oidCert = forge.pki.oids.certBag!;
    const primero = p12.getBags({ bagType: oidCert })[oidCert]?.[0]?.cert;
    expect(primero && base64(primero)).toBe(base64(raiz.cert));

    const leido = leerCertificadoPfx(pfxCadena, CLAVE);
    expect(leido.certificateBase64).toBe(base64(buena.cert));
    expect(leido.certificateBase64).not.toBe(base64(raiz.cert));
  });

  it("la firma lleva la hoja y verifica con su clave pública", () => {
    const firmado = firmarXml(XML, `${RUC}-01-F001-1`, { certificadoPfx: pfxCadena, certificadoClave: CLAVE });
    const x509 = firmado.xmlFirmado.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
    expect(x509).toBe(base64(buena.cert));
    expect(firmado.hash).toMatch(/^[A-Za-z0-9+/=]{20,}$/);

    const doc = new DOMParser().parseFromString(firmado.xmlFirmado, "text/xml");
    const firma = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    expect(firma).toBeDefined();
    const verificador = new SignedXml({ publicCert: forge.pki.certificateToPem(buena.cert) });
    verificador.loadSignature(firma as unknown as Node);
    expect(verificador.checkSignature(firmado.xmlFirmado)).toBe(true);

    // Y con la clave de la intermedia NO verifica: la prueba distingue.
    const otro = new SignedXml({ publicCert: forge.pki.certificateToPem(intermedia.cert) });
    otro.loadSignature(firma as unknown as Node);
    expect(() => otro.checkSignature(firmado.xmlFirmado)).toThrow();
  });

  it("contraseña equivocada: lo dice con esas palabras", () => {
    expect(() => leerCertificadoPfx(pfxCadena, "otra")).toThrow("La contraseña del certificado no es correcta.");
    try {
      datosCertificado(pfxCadena, "otra");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorCertificado);
      expect((e as ErrorCertificado).causa).toBe("clave_incorrecta");
    }
  });

  it("un archivo que no es un .pfx", () => {
    expect(() => leerCertificadoPfx(Buffer.from("no soy un pfx"), CLAVE)).toThrow(/no es un certificado/);
  });

  it("si ningún certificado casa con la llave, no firma con uno cualquiera", () => {
    const sinHoja = pfx(buena.key, [raiz.cert, intermedia.cert]);
    expect(() => leerCertificadoPfx(sinHoja, CLAVE)).toThrow(/corresponde a su clave privada/);
  });
});

describe("datosCertificado y problemasCertificado", () => {
  it("lee titular, RUC y fechas de la hoja, no de la CA", () => {
    const d = datosCertificado(pfxCadena, CLAVE);
    expect(d.titular).toBe("INVERSIONES RODATECH E.I.R.L.");
    expect(d.rucs).toEqual([RUC]);
    expect(d.emisor).toBe("INTERMEDIA DE PRUEBA");
    expect(d.validoHasta.toISOString()).toBe(EN_UN_ANO.toISOString());
    expect(problemasCertificado(d, RUC, HOY)).toEqual([]);
  });

  it("vencido", () => {
    const v = hoja(EMPRESA, new Date("2024-01-01T00:00:00Z"), new Date("2025-01-01T12:00:00Z"));
    const d = datosCertificado(pfx(v.key, [intermedia.cert, v.cert]), CLAVE);
    const p = problemasCertificado(d, RUC, HOY);
    expect(p.map((x) => x.causa)).toEqual(["vencido"]);
    expect(p[0]!.mensaje).toBe("El certificado venció el 01/01/2025. Hay que renovarlo con la entidad certificadora.");
  });

  it("todavía no vale", () => {
    const f = hoja(EMPRESA, new Date("2026-11-15T12:00:00Z"), new Date("2027-11-15T00:00:00Z"));
    const p = problemasCertificado(datosCertificado(pfx(f.key, [f.cert]), CLAVE), RUC, HOY);
    expect(p.map((x) => x.causa)).toEqual(["aun_no_vale"]);
    expect(p[0]!.mensaje).toContain("15/11/2026");
  });

  it("de otro RUC", () => {
    const o = hoja([
      { shortName: "CN", value: "OTRA EMPRESA S.A.C." },
      { shortName: "OU", value: OTRO_RUC },
    ]);
    const p = problemasCertificado(datosCertificado(pfx(o.key, [o.cert]), CLAVE), RUC, HOY);
    expect(p.map((x) => x.causa)).toEqual(["otro_ruc"]);
    expect(p[0]!.mensaje).toContain(OTRO_RUC);
  });

  it.each([
    ["serialNumber «RUC:…»", [{ shortName: "CN", value: "X" }, { name: "serialNumber", value: `RUC:${RUC}` }]],
    ["organizationIdentifier «VATPE-…»", [{ shortName: "CN", value: "X" }, { type: "2.5.4.97", value: `VATPE-${RUC}` }]],
    ["en el CN", [{ shortName: "CN", value: `INVERSIONES RODATECH E.I.R.L. - RUC ${RUC}` }]],
    ["OU «RUC …»", [{ shortName: "CN", value: "X" }, { shortName: "OU", value: `RUC ${RUC}` }]],
  ] as [string, Atributos][])("encuentra el RUC en %s", (_, sujeto) => {
    const c = hoja(sujeto);
    expect(datosCertificado(pfx(c.key, [c.cert]), CLAVE).rucs).toEqual([RUC]);
  });

  it("sin RUC reconocible no se rechaza: se avisa en pantalla", () => {
    const c = hoja([
      { shortName: "CN", value: "JUAN PEREZ" },
      { name: "serialNumber", value: "DNI 12345678" },
    ]);
    const d = datosCertificado(pfx(c.key, [c.cert]), CLAVE);
    expect(d.rucs).toEqual([]);
    expect(problemasCertificado(d, RUC, HOY)).toEqual([]);
  });

  it("rucValido mira el dígito verificador", () => {
    expect(rucValido(RUC)).toBe(true);
    expect(rucValido(OTRO_RUC)).toBe(true);
    expect(rucValido("20562681207")).toBe(false);
    expect(rucValido("12345678901")).toBe(false);
  });
});
