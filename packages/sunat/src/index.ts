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

import type {
  Comprobante,
  ComprobanteFirmado,
  NotaComprobante,
  ResultadoCdr,
} from "./dominio/index";
import { generarFacturaXml } from "./ubl/factura";
import { generarNotaXml } from "./ubl/nota";
import { generarGuiaXml } from "./ubl/guia";
import {
  generarResumenXml,
  idResumen,
  type ResumenBoletas,
} from "./ubl/resumen";
import { generarBajaXml, idBaja, type ComunicacionBaja } from "./ubl/baja";
import { firmarXml } from "./firma/firmar";
import { endpointFacturacion } from "./transporte/endpoints";
import { comprimirComprobante, extraerCdr } from "./transporte/zip";
import {
  enviarSendBill,
  enviarSendSummary,
  consultarEstado,
  probarCredenciales,
  type ResultadoPrueba,
} from "./transporte/soap";
import { parsearCdr } from "./cdr/index";

export type { ResultadoPrueba } from "./transporte/soap";
export type { ResumenBoletas, BoletaResumen } from "./ubl/resumen";
export type { ComunicacionBaja, DocumentoBaja } from "./ubl/baja";
// Los identificadores RC-/RA- se exponen para que la app pueda guardarlos y
// mostrarlos sin recalcular el formato por su cuenta.
export { idResumen } from "./ubl/resumen";
export { idBaja } from "./ubl/baja";

// Qué hacer ante un rechazo: si reenviar sirve de algo o hay que emitir otro.
export { clasificarRechazo, sePuedeReenviar, type Rechazo } from "./rechazos";

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
