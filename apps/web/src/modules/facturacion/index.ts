/**
 * Módulo de facturación: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaFacturacion } from "./ui/pagina";
export { default as PaginaNuevoComprobante } from "./ui/pagina-nueva";
export { default as PaginaDetalleComprobante } from "./ui/pagina-detalle";
export { default as PaginaImprimirComprobante } from "./ui/pagina-imprimir";
export { default as PaginaConfiguracionSunat } from "./ui/pagina-configuracion";

/*
  Qué falta para poder emitir.

  Se publica porque lo pregunta la pantalla de «SUNAT y numeración» (15/09):
  ahí se decide si hace falta entrar al certificado, y para decidirlo hay que
  saber qué falta. La lectura sigue viviendo aquí, que es donde se sabe.
*/
export { estadoConfiguracion } from "./api/configuracion";

// Reglas de emisión puras. Se publican porque guías y cobranzas necesitan las
// mismas: qué documento toca según el receptor, y cómo se reparten las cuotas.
export {
  DOC_SUNAT,
  aplicaDetraccion,
  bloqueosEmision,
  cuotasDe,
  docSunatDe,
  montoDetraccion,
  tipoSugerido,
  totalesDe,
  unidadSunat,
  vencimientoDe,
  type Cuota,
  type TotalesComprobante,
} from "./dominio/emision";

export {
  ETIQUETA_SUNAT,
  ETIQUETA_TIPO,
  type ComprobanteDetalle,
  type ComprobanteLista,
  type ConfigFiscal,
  type EstadoComprobante,
  type EstadoConfiguracion,
  type EstadoSunat,
  type FiltrosComprobantes,
  type LineaComprobante,
  type TipoComprobante,
} from "./dominio/tipos";
