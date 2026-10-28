/**
 * Lectura del certificado digital (.pfx / .p12) del emisor.
 *
 * Extrae la clave privada y el certificado X509 en formato PEM, que es lo que
 * consume el firmador. Usa node-forge (PKCS#12) — no dependemos de OpenSSL en el
 * sistema, así funciona igual en el servidor o en una función serverless.
 *
 * ---------------------------------------------------------------------------
 * El certificado bueno de la cadena (auditoría SUNAT 28/10, B3)
 * ---------------------------------------------------------------------------
 * Hasta el 28/10 se tomaba el PRIMER certificado del archivo. Los .pfx de una
 * entidad de certificación (Llama.pe incluida) suelen traer también la CA
 * intermedia y la raíz, y el orden no lo garantiza nadie: si la primera era
 * la intermedia, el <ds:X509Certificate> de la firma no casaba con la llave y
 * SUNAT rechazaba TODO por firma inválida. Con el .pfx de beta no se veía,
 * porque es autofirmado y trae uno solo.
 *
 * Ahora se elige el certificado cuya clave pública es la de la llave privada.
 * Es la única regla que no depende de cómo exportó el archivo cada programa.
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

/** Por qué no se pudo usar un certificado. La pantalla elige la frase con esto. */
export type CausaCertificado =
  | "clave_incorrecta"
  | "formato"
  | "sin_llave"
  | "sin_certificado"
  | "no_corresponde";

export class ErrorCertificado extends Error {
  constructor(
    readonly causa: CausaCertificado,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorCertificado";
  }
}

/** Lo que se lee del certificado del titular, para enseñarlo y validarlo. */
export interface DatosCertificado {
  /** El CN del titular (la razón social, en un certificado de empresa). */
  titular: string;
  /** Las RUC válidas que aparecen en el sujeto (normalmente una). */
  rucs: string[];
  /** El emisor, legible («LLAMA.PE …»). */
  emisor: string;
  /** Desde y hasta cuándo vale. */
  validoDesde: Date;
  validoHasta: Date;
  /** El sujeto entero, como texto, por si hay que mirarlo a mano. */
  sujeto: string;
}

/** Contenido y certificado del titular, ya elegido de la cadena. */
interface Abierto {
  key: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

/**
 * Resuelve un OID por su nombre en la tabla de node-forge.
 *
 * La tabla está tipada como índice abierto, así que el acceso devuelve
 * `string | undefined` y no sirve como clave de otro índice. Estos OID
 * siempre existen; si alguna vez faltaran sería un cambio incompatible de
 * node-forge, y es mejor enterarse aquí que producir una firma inválida.
 */
function oid(nombre: "pkcs8ShroudedKeyBag" | "keyBag" | "certBag"): string {
  const valor = forge.pki.oids[nombre];
  if (!valor) {
    throw new Error(`node-forge no define el OID ${nombre}.`);
  }
  return valor;
}

/** ¿La clave pública del certificado es la de esta llave privada? */
function casan(key: forge.pki.rsa.PrivateKey, cert: forge.pki.Certificate): boolean {
  const pub = cert.publicKey as Partial<forge.pki.rsa.PublicKey>;
  // Un certificado que no es RSA no tiene `n`: no puede ser el de esta llave.
  if (!pub || !pub.n || !pub.e) return false;
  return pub.n.equals(key.n) && pub.e.equals(key.e);
}

/** Abre el .pfx y elige la llave y SU certificado. */
function abrir(pfx: Buffer, clave: string): Abierto {
  let p12: forge.pkcs12.Pkcs12Pfx;
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")));
  } catch {
    throw new ErrorCertificado(
      "formato",
      "El archivo no es un certificado .pfx/.p12 válido. Comprueba que sea el que dio la entidad certificadora.",
    );
  }
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/unsupported/i.test(m)) {
      throw new ErrorCertificado(
        "formato",
        `El certificado está cifrado de una forma que no se puede leer (${m}). Pide a la entidad un .pfx en formato estándar.`,
      );
    }
    // Con MAC —todos los .pfx de verdad lo llevan— una clave equivocada da
    // «MAC could not be verified». Sin MAC, descifrar con otra clave da
    // basura y el error es de ASN.1: es la misma causa.
    throw new ErrorCertificado("clave_incorrecta", "La contraseña del certificado no es correcta.");
  }

  // Las llaves: cifradas (lo normal) y sin cifrar (algunos exportadores).
  const llaves: forge.pki.rsa.PrivateKey[] = [];
  for (const tipo of [oid("pkcs8ShroudedKeyBag"), oid("keyBag")]) {
    for (const bag of p12.getBags({ bagType: tipo })[tipo] ?? []) {
      if (bag.key) llaves.push(bag.key as forge.pki.rsa.PrivateKey);
    }
  }
  if (llaves.length === 0) {
    throw new ErrorCertificado(
      "sin_llave",
      "El archivo no trae la clave privada. Hay que exportarlo CON la clave privada (.pfx), no solo el certificado (.cer).",
    );
  }

  const oidCert = oid("certBag");
  const certs = (p12.getBags({ bagType: oidCert })[oidCert] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  if (certs.length === 0) {
    throw new ErrorCertificado("sin_certificado", "No se encontró el certificado X509 en el archivo.");
  }

  for (const key of llaves) {
    const cert = certs.find((c) => casan(key, c));
    if (cert) return { key, cert };
  }
  throw new ErrorCertificado(
    "no_corresponde",
    "Ningún certificado del archivo corresponde a su clave privada. Vuelve a exportarlo desde donde se instaló.",
  );
}

/**
 * Abre un .pfx/.p12 y devuelve la clave privada y el certificado DEL TITULAR
 * en PEM —el que casa con la llave, no la CA que venga delante—.
 * @param pfx contenido binario del certificado
 * @param clave contraseña del certificado
 * @throws ErrorCertificado con su causa
 */
export function leerCertificadoPfx(pfx: Buffer, clave: string): CertificadoPem {
  const { key, cert } = abrir(pfx, clave);
  const privateKeyPem = forge.pki.privateKeyToPem(key);
  const certificatePem = forge.pki.certificateToPem(cert);
  // base64 del DER del certificado, para el nodo <ds:X509Certificate>
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certificateBase64 = forge.util.encode64(certDer);
  return { privateKeyPem, certificatePem, certificateBase64 };
}

// ---------------------------------------------------------------------------
// El RUC del titular
// ---------------------------------------------------------------------------

/** El dígito verificador de un RUC (módulo 11, pesos 5432765432). */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(ruc[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(ruc[10]);
}

/**
 * Dónde mirar el RUC, en orden.
 *
 * Cada entidad peruana lo pone en un sitio: en `serialNumber` («20…»,
 * «RUC:20…», «RUC 20…»), en `organizationIdentifier` (2.5.4.97, el formato
 * europeo «VATPE-20…»), en la `OU` («20…» o «RUC 20…») y algunas en el `CN`
 * («RAZÓN SOCIAL - RUC 20…»). No se apuesta por uno: se busca un número de
 * 11 cifras con su dígito verificador en todos, empezando por los más
 * específicos. El dígito verificador es lo que evita confundirlo con un
 * teléfono o un número de serie.
 */
const PRIORIDAD = ["serialNumber", "2.5.4.97", "OU", "CN", "O"];

function nombreCampo(attr: forge.pki.CertificateField): string {
  return attr.shortName ?? attr.name ?? attr.type ?? "";
}

function valor(attr: forge.pki.CertificateField): string {
  return typeof attr.value === "string" ? attr.value : String(attr.value ?? "");
}

function rucsDelSujeto(attrs: forge.pki.CertificateField[]): string[] {
  const orden = (a: forge.pki.CertificateField) => {
    const k = nombreCampo(a);
    const i = PRIORIDAD.findIndex((p) => p === k || a.type === p);
    return i === -1 ? PRIORIDAD.length : i;
  };
  const rucs: string[] = [];
  for (const a of [...attrs].sort((x, y) => orden(x) - orden(y))) {
    for (const m of valor(a).matchAll(/(?<!\d)(\d{11})(?!\d)/g)) {
      const r = m[1]!;
      if (rucValido(r) && !rucs.includes(r)) rucs.push(r);
    }
  }
  return rucs;
}

function textoDe(attrs: forge.pki.CertificateField[]): string {
  return attrs.map((a) => `${nombreCampo(a)}=${valor(a)}`).join(", ");
}

/**
 * Lee el certificado del titular: quién es, qué RUC lleva y hasta cuándo vale.
 * @throws ErrorCertificado si la contraseña no abre el archivo o falta algo
 */
export function datosCertificado(pfx: Buffer, clave: string): DatosCertificado {
  const { cert } = abrir(pfx, clave);
  const cn = cert.subject.getField("CN");
  const o = cert.subject.getField("O");
  const emisorCn = cert.issuer.getField("CN") ?? cert.issuer.getField("O");
  return {
    titular: cn ? valor(cn).trim() : o ? valor(o).trim() : "",
    rucs: rucsDelSujeto(cert.subject.attributes),
    emisor: emisorCn ? valor(emisorCn).trim() : textoDe(cert.issuer.attributes),
    validoDesde: cert.validity.notBefore,
    validoHasta: cert.validity.notAfter,
    sujeto: textoDe(cert.subject.attributes),
  };
}

/** Por qué no se acepta un certificado que sí se abrió. */
export type ProblemaCertificado =
  | { causa: "otro_ruc"; mensaje: string }
  | { causa: "vencido"; mensaje: string }
  | { causa: "aun_no_vale"; mensaje: string };

function ddmmaaaa(d: Date): string {
  // En hora de Lima: un certificado que vence a las 23:00 UTC vence a las
  // 18:00 de Lima, el mismo día.
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * ¿Sirve este certificado para firmar por esta empresa, hoy?
 *
 * Puro: el reloj entra por parámetro. Un certificado sin RUC reconocible NO
 * se rechaza —hay formatos que no se han visto todavía, y bloquear al dueño
 * el día que lo compra por una suposición nuestra sería peor—: la pantalla
 * lo avisa (`rucs` vacío) y SUNAT lo dirá con la primera factura.
 */
export function problemasCertificado(
  datos: Pick<DatosCertificado, "rucs" | "validoDesde" | "validoHasta">,
  rucEmpresa: string,
  ahora: Date,
): ProblemaCertificado[] {
  const r: ProblemaCertificado[] = [];
  if (datos.rucs.length > 0 && !datos.rucs.includes(rucEmpresa)) {
    r.push({
      causa: "otro_ruc",
      mensaje: `El certificado es del RUC ${datos.rucs.join(", ")} y la empresa es el ${rucEmpresa}. Sube el certificado de la empresa.`,
    });
  }
  if (ahora.getTime() > datos.validoHasta.getTime()) {
    r.push({
      causa: "vencido",
      mensaje: `El certificado venció el ${ddmmaaaa(datos.validoHasta)}. Hay que renovarlo con la entidad certificadora.`,
    });
  }
  if (ahora.getTime() < datos.validoDesde.getTime()) {
    r.push({
      causa: "aun_no_vale",
      mensaje: `El certificado todavía no es válido: empieza a valer el ${ddmmaaaa(datos.validoDesde)}.`,
    });
  }
  return r;
}

export { ddmmaaaa as fechaCertificado };
