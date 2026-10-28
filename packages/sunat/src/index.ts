/**
 * @rodatech/sunat — Conector de facturación electrónica SUNAT (Perú).
 *
 * Paquete autónomo: genera XML UBL 2.1, lo firma (XML-DSig), lo envía a SUNAT
 * por SOAP y procesa el CDR. No depende de la app que lo usa — recibe objetos
 * de dominio y devuelve XML/CDR. Para reutilizarlo en otro proyecto se copia la
 * carpeta y se ajusta la configuración del emisor.
 *
 * Estado: andamiaje. Los módulos ubl/firma/transporte/cdr se implementan por
 * fases (A: factura+boleta, B: notas, C: resumen+baja, D: guías).
 */

export * from "./catalogos/index";
export * from "./catalogos/validaciones";
export * from "./dominio/index";
export * from "./dominio/guia";
// Representación impresa: el QR y la leyenda del monto son parte de lo que
// SUNAT exige entregar al comprador, así que viajan con el conector.
export * from "./impresion/qr";
export { montoEnLetras } from "./ubl/numero-a-letras";

// El XML de la guía, para revisarlo; el envío va por `emitirGuia` (REST, 15/10).
export { generarGuiaXml } from "./ubl/guia";

import type {
  Comprobante,
  ComprobanteFirmado,
  NotaComprobante,
  ResultadoCdr,
} from "./dominio/index";
import { generarFacturaXml } from "./ubl/factura";
import { generarNotaXml } from "./ubl/nota";
import {
  generarResumenXml,
  idResumen,
  type ResumenBoletas,
} from "./ubl/resumen";
import { generarBajaXml, idBaja, type ComunicacionBaja } from "./ubl/baja";
import { firmarXml } from "./firma/firmar";
import { endpointConsultaCdr, endpointFacturacion } from "./transporte/endpoints";
import { comprimirComprobante, extraerCdr } from "./transporte/zip";
import {
  enviarSendBill,
  enviarSendSummary,
  consultarEstado,
  consultarCdr,
  probarCredenciales,
  type ResultadoPrueba,
} from "./transporte/soap";
import { parsearCdr } from "./cdr/index";
import type { ResultadoConsultaCdr } from "./red";
import { generarGuiaXml } from "./ubl/guia";
import type { GuiaRemision } from "./dominio/guia";
import { consultarTicketGre, enviarGre, ErrorGre, type CredencialesGre } from "./transporte/gre";

// `enviarGre` sale también para las pruebas del viaje de la guía (M5): con un
// SUNAT falso por `fetch`, el envío real sin tener que firmar.
export { ErrorGre, enviarGre, hashZip } from "./transporte/gre";
export type { CredencialesGre } from "./transporte/gre";

export type { ResultadoPrueba } from "./transporte/soap";
export type { ResumenBoletas, BoletaResumen } from "./ubl/resumen";
export type { ComunicacionBaja, DocumentoBaja } from "./ubl/baja";
// Los identificadores RC-/RA- se exponen para que la app pueda guardarlos y
// mostrarlos sin recalcular el formato por su cuenta.
export { idResumen } from "./ubl/resumen";
export { idBaja } from "./ubl/baja";

// Qué hacer ante un rechazo: si reenviar sirve de algo o hay que emitir otro.
export { clasificarRechazo, sePuedeReenviar, type Rechazo } from "./rechazos";

// Cuando SUNAT no contesta, o contesta 1033 a algo que ya se mandó (21/10).
export {
  ErrorRedSunat,
  MENSAJE_SIN_CONEXION,
  MENSAJE_RESPUESTA_INCIERTA,
  MENSAJE_1033_SIN_CONFIRMAR,
  decidirEnvio,
  esErrorDeRed,
  esRespuestaIncierta,
  estadoDeCdr,
  hayQueConsultarAntesDeRechazar,
  mensajeParaPersona,
  type Decision,
  type ResultadoConsultaCdr,
} from "./red";

/** Resultado de enviar un resumen: se obtiene un ticket, no un CDR inmediato. */
export interface ResultadoResumen {
  aceptadoEnvio: boolean;
  ticket?: string;
  /** Mensaje de error si el envío falló. */
  error?: string;
  /** Nombre del documento (RUC-RC-AAAAMMDD-n), para archivarlo. */
  nombre: string;
  /** XML firmado que se envió, para archivarlo. */
  xmlFirmado: string;
}

/** Ambiente de emisión. Beta = homologación de SUNAT; produccion = real. */
export type Ambiente = "beta" | "produccion";

/** Configuración del conector (una por empresa emisora). */
export interface ConfigSunat {
  ambiente: Ambiente;
  /** Certificado digital .pfx/.p12 en Buffer. */
  certificadoPfx: Buffer;
  /** Clave del certificado. */
  certificadoClave: string;
  /** Usuario SOL secundario: RUC + usuario, p.ej. 20609715732MODDATOS. */
  usuarioSol: string;
  /** Clave del usuario SOL. */
  claveSol: string;
  /**
   * Las credenciales de API de la guía (OAuth2). Las genera el contribuyente
   * en SOL › «Credenciales de API SUNAT»; sin ellas no se envían guías.
   */
  gre?: Pick<CredencialesGre, "clientId" | "clientSecret" | "urlToken" | "hostEnvio">;
}

/** Lo que devuelve mandar una guía: el ticket, y el XML firmado para guardarlo. */
export interface EnvioGuia {
  ticket: string;
  nombre: string;
  xmlFirmado: string;
  hash: string;
}

/**
 * Contrato del conector. La implementación concreta se construye por fases;
 * la app depende de esta interfaz, no de los detalles internos.
 */
export interface ConectorSunat {
  /** Genera el XML UBL 2.1 de un comprobante y lo firma con el certificado. */
  generarYFirmar(comprobante: Comprobante): Promise<ComprobanteFirmado>;

  /** Envía un comprobante firmado a SUNAT y devuelve el CDR procesado. */
  enviar(
    firmado: ComprobanteFirmado,
    tipoDocumento: string,
    serie: string,
    correlativo: number,
  ): Promise<ResultadoCdr>;

  /** Atajo: genera, firma y envía en un paso. */
  emitir(comprobante: Comprobante): Promise<ResultadoCdr>;

  /** Genera el XML de una nota (07/08) y lo firma. */
  generarYFirmarNota(nota: NotaComprobante): Promise<ComprobanteFirmado>;

  /** Genera, firma y envía una nota de crédito (07) o débito (08). */
  emitirNota(nota: NotaComprobante): Promise<ResultadoCdr>;

  /**
   * Envía el resumen diario de boletas. Devuelve un ticket; el resultado real
   * (CDR) se consulta después con consultarResumen(ticket).
   */
  emitirResumenBoletas(resumen: ResumenBoletas): Promise<ResultadoResumen>;

  /**
   * Comunica la baja (anulación) de facturas y sus notas ya aceptadas. Como el
   * resumen, es asíncrono: devuelve un ticket que se consulta con consultarResumen.
   */
  emitirComunicacionBaja(baja: ComunicacionBaja): Promise<ResultadoResumen>;

  /** Consulta el CDR de un resumen o baja ya enviado, por su ticket. */
  consultarResumen(ticket: string): Promise<ResultadoCdr | { enProceso: true }>;

  /**
   * Comprueba las credenciales SOL contra SUNAT sin emitir nada.
   * Permite validar la configuración antes de arriesgar un comprobante real.
   */
  probarConexion(ruc: string): Promise<ResultadoPrueba>;

  /**
   * Firma y manda una guía de remisión (09) por la API REST de la GRE.
   * Asíncrono: devuelve el ticket; el CDR se pregunta con consultarGuia.
   */
  emitirGuia(guia: GuiaRemision): Promise<EnvioGuia>;

  /** Cómo quedó una guía enviada, por su ticket. */
  consultarGuia(ticket: string): Promise<ResultadoCdr | { enProceso: true }>;

  /**
   * La constancia (CDR) que SUNAT tiene de un comprobante, por su número
   * (getStatusCdr). Para no emitir otro ante un 1033 sobre algo que ya se
   * mandó. En beta no existe el servicio: devuelve `sinCdr`. Un corte de red
   * sale como `ErrorRedSunat`.
   */
  consultarCdr(
    ruc: string,
    tipoDocumento: string,
    serie: string,
    correlativo: number,
  ): Promise<ResultadoConsultaCdr>;
}

/**
 * El CDR de la GRE llega en base64 y no está claro si es un ZIP (como en la
 * factura) o el XML a secas: se mira la firma «PK» y se trata según sea.
 */
async function cdrDeBase64(b64: string): Promise<string> {
  const bytes = Buffer.from(b64, "base64");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extraerCdr(b64);
  return bytes.toString("utf8");
}

/** Las cuatro credenciales de la GRE, o un error que dice cuál falta. */
function credencialesGre(config: ConfigSunat): CredencialesGre {
  if (!config.gre?.clientId || !config.gre.clientSecret) {
    throw new ErrorGre(
      "Faltan las credenciales de API de SUNAT para guías (client_id y client_secret). Se generan en SOL › Credenciales de API SUNAT.",
      null,
      null,
    );
  }
  return { ...config.gre, usuarioSol: config.usuarioSol, claveSol: config.claveSol };
}

/** Nombre del documento según SUNAT: RUC-tipo-serie-correlativo. */
function nombreDocumento(
  ruc: string,
  tipoDoc: string,
  serie: string,
  correlativo: number,
): string {
  return `${ruc}-${tipoDoc}-${serie}-${correlativo}`;
}

/**
 * Firma un XML de resumen/baja, lo empaqueta y lo envía por sendSummary.
 * Ambos comparten este flujo asíncrono (devuelven ticket).
 */
async function enviarResumenOBaja(
  config: ConfigSunat,
  nombre: string,
  xml: string,
): Promise<ResultadoResumen> {
  const firmado = firmarXml(xml, nombre, {
    certificadoPfx: config.certificadoPfx,
    certificadoClave: config.certificadoClave,
  });
  const zipB64 = await comprimirComprobante(firmado.nombre, firmado.xmlFirmado);
  const archivo = { nombre: firmado.nombre, xmlFirmado: firmado.xmlFirmado };
  const resp = await enviarSendSummary(
    endpointFacturacion(config.ambiente),
    config.usuarioSol,
    config.claveSol,
    `${firmado.nombre}.zip`,
    zipB64,
  );
  if (resp.fault) {
    return { aceptadoEnvio: false, error: resp.fault.message, ...archivo };
  }
  return { aceptadoEnvio: true, ticket: resp.ticket, ...archivo };
}

/**
 * Crea el conector SUNAT a partir de la configuración del emisor.
 * Fase A: factura (01) y boleta (03).
 */
export function crearConector(config: ConfigSunat): ConectorSunat {
  return {
    async generarYFirmar(comprobante) {
      const xml = generarFacturaXml(comprobante);
      const nombre = nombreDocumento(
        comprobante.emisor.ruc,
        comprobante.tipoDocumento,
        comprobante.serie,
        comprobante.correlativo,
      );
      return firmarXml(xml, nombre, {
        certificadoPfx: config.certificadoPfx,
        certificadoClave: config.certificadoClave,
      });
    },

    async enviar(firmado) {
      const endpoint = endpointFacturacion(config.ambiente);
      const zipB64 = await comprimirComprobante(
        firmado.nombre,
        firmado.xmlFirmado,
      );
      const resp = await enviarSendBill(
        endpoint,
        config.usuarioSol,
        config.claveSol,
        `${firmado.nombre}.zip`,
        zipB64,
      );

      if (resp.fault) {
        return {
          aceptado: false,
          codigo: resp.fault.code,
          descripcion: resp.fault.message,
          observaciones: [],
        };
      }

      const cdrXml = await extraerCdr(resp.applicationResponse!);
      return parsearCdr(cdrXml);
    },

    async emitir(comprobante) {
      const firmado = await this.generarYFirmar(comprobante);
      return this.enviar(
        firmado,
        comprobante.tipoDocumento,
        comprobante.serie,
        comprobante.correlativo,
      );
    },

    async generarYFirmarNota(nota) {
      const xml = generarNotaXml(nota);
      const nombre = nombreDocumento(
        nota.emisor.ruc,
        nota.tipoDocumento,
        nota.serie,
        nota.correlativo,
      );
      return firmarXml(xml, nombre, {
        certificadoPfx: config.certificadoPfx,
        certificadoClave: config.certificadoClave,
      });
    },

    async emitirNota(nota) {
      const firmado = await this.generarYFirmarNota(nota);
      return this.enviar(
        firmado,
        nota.tipoDocumento,
        nota.serie,
        nota.correlativo,
      );
    },

    async emitirResumenBoletas(resumen) {
      const nombre = `${resumen.emisor.ruc}-${idResumen(
        resumen.fechaGeneracion,
        resumen.correlativo,
      )}`;
      return enviarResumenOBaja(config, nombre, generarResumenXml(resumen));
    },

    async emitirComunicacionBaja(baja) {
      const nombre = `${baja.emisor.ruc}-${idBaja(
        baja.fechaComunicacion,
        baja.correlativo,
      )}`;
      return enviarResumenOBaja(config, nombre, generarBajaXml(baja));
    },

    async probarConexion(ruc) {
      return probarCredenciales(
        endpointFacturacion(config.ambiente),
        config.usuarioSol,
        config.claveSol,
        ruc,
      );
    },

    async emitirGuia(guia) {
      const gre = credencialesGre(config);
      const nombre = nombreDocumento(guia.emisor.ruc, guia.tipoDocumento, guia.serie, guia.correlativo);
      const firmado = firmarXml(generarGuiaXml(guia), nombre, {
        certificadoPfx: config.certificadoPfx,
        certificadoClave: config.certificadoClave,
      });
      const zipB64 = await comprimirComprobante(firmado.nombre, firmado.xmlFirmado);
      const ticket = await enviarGre(gre, firmado.nombre, zipB64);
      return { ticket, nombre: firmado.nombre, xmlFirmado: firmado.xmlFirmado, hash: firmado.hash };
    },

    async consultarGuia(ticket) {
      const r = await consultarTicketGre(credencialesGre(config), ticket);
      if (r.estado === "en_proceso") return { enProceso: true };
      if (r.cdr) {
        const cdr = parsearCdr(await cdrDeBase64(r.cdr));
        // Con error y CDR, manda el CDR (trae el código de rechazo); sin CDR,
        // el error del envío.
        return cdr;
      }
      if (r.estado === "procesado") {
        // «0» sin constancia (CDR): aceptada según SUNAT, pero sin prueba. Se
        // marca con una observación para que se vea y se revise (auditoría).
        return {
          aceptado: true,
          codigo: "0",
          descripcion: "SUNAT la dio por recibida, pero no devolvió la constancia (CDR). Revísala en SUNAT.",
          observaciones: ["Sin constancia de recepción (CDR)."],
        };
      }
      return { aceptado: false, codigo: r.codigo ?? "99", descripcion: r.mensaje, observaciones: [] };
    },

    async consultarCdr(ruc, tipoDocumento, serie, correlativo) {
      const endpoint = endpointConsultaCdr(config.ambiente);
      if (!endpoint) {
        return { sinCdr: "SUNAT no ofrece la consulta de constancias en el ambiente de pruebas." };
      }
      const resp = await consultarCdr(
        endpoint,
        config.usuarioSol,
        config.claveSol,
        ruc,
        tipoDocumento,
        serie,
        correlativo,
      );
      if (resp.fault) return { sinCdr: resp.fault.message };
      if (!resp.applicationResponse) {
        return { sinCdr: resp.statusMessage ?? "SUNAT no devolvió la constancia." };
      }
      return { cdr: parsearCdr(await extraerCdr(resp.applicationResponse)) };
    },

    async consultarResumen(ticket) {
      const resp = await consultarEstado(
        endpointFacturacion(config.ambiente),
        config.usuarioSol,
        config.claveSol,
        ticket,
      );
      if (resp.fault) {
        return {
          aceptado: false,
          codigo: resp.fault.code,
          descripcion: resp.fault.message,
          observaciones: [],
        };
      }
      // 98 = aún en proceso; sin CDR todavía.
      if (resp.statusCode === "98" || !resp.applicationResponse) {
        return { enProceso: true };
      }
      const cdrXml = await extraerCdr(resp.applicationResponse);
      return parsearCdr(cdrXml);
    },
  };
}
