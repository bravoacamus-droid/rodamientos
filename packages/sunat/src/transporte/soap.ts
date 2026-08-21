/**
 * Cliente SOAP para el web service de SUNAT (operación sendBill).
 *
 * Se construye el sobre SOAP a mano (sin cliente WSDL genérico): más control
 * sobre WS-Security y menos dependencias. La estructura del header de seguridad
 * está verificada contra Greenter (Ws\Header\WSSESecurityHeader).
 *
 * WS-Security: UsernameToken con la contraseña en texto plano (PasswordText).
 * El Username es RUC + usuario SOL secundario, p.ej. 20609715732MODDATOS.
 */
import { XMLParser } from "fast-xml-parser";

const WSS_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PASSWORD_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const BILL_NS = "http://service.sunat.gob.pe";

function escaparXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RespuestaSoap {
  /** applicationResponse (ZIP del CDR en base64), si SUNAT aceptó el envío. */
  applicationResponse?: string;
  /** SOAP Fault: SUNAT rechazó el envío antes de generar CDR. */
  fault?: { code: string; message: string };
}

/** Cabecera WS-Security reutilizable. */
function headerSeguridad(usuario: string, clave: string): string {
  return `  <soapenv:Header>
    <wsse:Security xmlns:wsse="${WSS_NS}">
      <wsse:UsernameToken>
        <wsse:Username>${escaparXml(usuario)}</wsse:Username>
        <wsse:Password Type="${PASSWORD_TYPE}">${escaparXml(clave)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>`;
}

/**
 * POST del sobre SOAP con reintento ante 401/503 transitorios (throttling del
 * nginx de SUNAT, antes de llegar al SOAP). No reintenta un 200 con SOAP Fault:
 * eso es un rechazo real. Devuelve el body de la respuesta ya parseado.
 */
async function postSoap(
  endpoint: string,
  sobre: string,
): Promise<
  // El body proviene de XML parseado sin esquema fijo; se accede dinámicamente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { fault: { code: string; message: string } } | { body: any; texto: string }
> {
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let res: Response | null = null;
  for (let intento = 0; intento < 4; intento++) {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: sobre,
    });
    if (res.status !== 401 && res.status !== 503) break;
    if (intento < 3) await espera(1500 * (intento + 1));
  }
  if (!res) {
    return { fault: { code: "sin_conexion", message: "No hubo respuesta de SUNAT." } };
  }

  const texto = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const doc = parser.parse(texto);
  const body = (doc?.Envelope ?? doc)?.Body ?? {};

  const fault = body?.Fault;
  if (fault) {
    return {
      fault: {
        code: String(fault.faultcode ?? fault.Code?.Value ?? "unknown"),
        message: String(fault.faultstring ?? fault.Reason?.Text ?? texto).trim(),
      },
    };
  }
  return { body, texto };
}

/**
 * Envía un comprobante a SUNAT vía sendBill (factura, boleta, notas).
 * @param fileName nombre del ZIP: RUC-tipo-serie-corr.zip
 * @param contentFileB64 ZIP del comprobante en base64
 */
export async function enviarSendBill(
  endpoint: string,
  usuario: string,
  clave: string,
  fileName: string,
  contentFileB64: string,
): Promise<RespuestaSoap> {
  const sobre = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${BILL_NS}">
${headerSeguridad(usuario, clave)}
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${escaparXml(fileName)}</fileName>
      <contentFile>${contentFileB64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r = await postSoap(endpoint, sobre);
  if ("fault" in r) return { fault: r.fault };

  const appResp =
    r.body?.sendBillResponse?.applicationResponse ??
    r.body?.sendBillResponse?.["return"]?.applicationResponse;
  if (!appResp) {
    return {
      fault: {
        code: "sin_respuesta",
        message: `SUNAT no devolvió applicationResponse. Respuesta: ${r.texto.slice(0, 500)}`,
      },
    };
  }
  return { applicationResponse: String(appResp) };
}

/** Veredicto de una prueba de credenciales SOL. */
export interface ResultadoPrueba {
  /** ¿Las credenciales sirven para emitir? */
  ok: boolean;
  /** Qué falla exactamente, para poder actuar. */
  causa:
    | "ok"
    | "clave_incorrecta"
    | "usuario_no_existe"
    | "usuario_no_habilitado"
    | "desconocido";
  /** Mensaje literal que devolvió SUNAT, sin interpretar. */
  mensajeSunat: string;
}

/**
 * Comprueba si el usuario SOL y su clave sirven, SIN emitir nada.
 *
 * Se manda un sendBill con un contenido que no es un ZIP válido. SUNAT valida
 * las credenciales ANTES de mirar el archivo, así que el error que devuelve
 * distingue los casos: si se queja del archivo, es que autenticó.
 *
 * Se usa sendBill y no getStatus porque getStatus en producción responde 200 con
 * cuerpo vacío tanto con la clave correcta como con una falsa: no discrimina.
 *
 * No consume correlativos —los asigna el emisor, no SUNAT— ni deja rastro de un
 * comprobante: el envío se rechaza antes de procesarse.
 */
export async function probarCredenciales(
  endpoint: string,
  usuario: string,
  clave: string,
  ruc: string,
): Promise<ResultadoPrueba> {
  const noEsUnZip = Buffer.from("prueba de conexion").toString("base64");
  const r = await enviarSendBill(
    endpoint,
    usuario,
    clave,
    `${ruc}-01-F001-1.zip`,
    noEsUnZip,
  );

  const msg = r.fault?.message ?? "";
  if (!r.fault) {
    // Improbable (el archivo es basura), pero autenticar es lo que se medía.
    return { ok: true, causa: "ok", mensajeSunat: "Conexión correcta." };
  }
  if (/contrase\w*a incorrect|clave incorrect/i.test(msg)) {
    return { ok: false, causa: "clave_incorrecta", mensajeSunat: msg };
  }
  if (/usuario.*no existe|no existe.*usuario/i.test(msg)) {
    return { ok: false, causa: "usuario_no_existe", mensajeSunat: msg };
  }
  // Autenticó, pero el usuario no puede usar el web service: es el usuario
  // PRINCIPAL, o un secundario sin el permiso de comprobantes de pago.
  if (/tipo de usuario|no autorizado|no tiene.*perfil/i.test(msg)) {
    return { ok: false, causa: "usuario_no_habilitado", mensajeSunat: msg };
  }
  // Cualquier otra queja es sobre el archivo enviado: las credenciales pasaron.
  return { ok: true, causa: "ok", mensajeSunat: msg };
}

export interface RespuestaTicket {
  ticket?: string;
  fault?: { code: string; message: string };
}

/**
 * Envía un resumen (boletas o comunicación de baja) vía sendSummary.
 * SUNAT lo procesa de forma asíncrona: devuelve un TICKET, no el CDR.
 */
export async function enviarSendSummary(
  endpoint: string,
  usuario: string,
  clave: string,
  fileName: string,
  contentFileB64: string,
): Promise<RespuestaTicket> {
  const sobre = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${BILL_NS}">
${headerSeguridad(usuario, clave)}
  <soapenv:Body>
    <ser:sendSummary>
      <fileName>${escaparXml(fileName)}</fileName>
      <contentFile>${contentFileB64}</contentFile>
    </ser:sendSummary>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r = await postSoap(endpoint, sobre);
  if ("fault" in r) return { fault: r.fault };

  const ticket =
    r.body?.sendSummaryResponse?.ticket ??
    r.body?.sendSummaryResponse?.["return"]?.ticket;
  if (!ticket) {
    return {
      fault: {
        code: "sin_ticket",
        message: `SUNAT no devolvió ticket. Respuesta: ${r.texto.slice(0, 500)}`,
      },
    };
  }
  return { ticket: String(ticket) };
}

export interface RespuestaEstado {
  /** Código de estado del proceso: "0" listo (CDR disponible), "98" en proceso. */
  statusCode?: string;
  /** applicationResponse (ZIP del CDR) cuando statusCode = 0. */
  applicationResponse?: string;
  fault?: { code: string; message: string };
}

/**
 * Consulta el estado de un resumen por su ticket (getStatus).
 * statusCode 0 = procesado (trae el CDR); 98 = aún en proceso; otro = con error.
 */
export async function consultarEstado(
  endpoint: string,
  usuario: string,
  clave: string,
  ticket: string,
): Promise<RespuestaEstado> {
  const sobre = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${BILL_NS}">
${headerSeguridad(usuario, clave)}
  <soapenv:Body>
    <ser:getStatus>
      <ticket>${escaparXml(ticket)}</ticket>
    </ser:getStatus>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r = await postSoap(endpoint, sobre);
  if ("fault" in r) return { fault: r.fault };

  const status =
    r.body?.getStatusResponse?.status ??
    r.body?.getStatusResponse?.["return"]?.status;
  return {
    statusCode: status?.statusCode != null ? String(status.statusCode) : undefined,
    applicationResponse: status?.content ? String(status.content) : undefined,
  };
}
