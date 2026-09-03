/**
 * Módulo de guías de remisión: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaGuias } from "./ui/pagina";
export { default as PaginaNuevaGuia } from "./ui/pagina-nueva";
export { default as PaginaDetalleGuia } from "./ui/pagina-detalle";
export { default as PaginaImprimirGuia } from "./ui/pagina-imprimir";

// El reducer es puro y se prueba sin React. Se publica porque cobranzas va a
// necesitar saber qué salió y qué no para cuadrar entregas contra facturas.
export {
  aPayload,
  avisos,
  bloqueosBorrador,
  bloqueosEmision,
  estadoInicial,
  faltaPeso,
  pesoCalculado,
  pesoEfectivo,
  reducir,
  type Accion,
  type EstadoGuiaEnCurso,
  type LineaDespacho,
} from "./dominio/constructor";

export {
  ETIQUETA_ESTADO,
  ETIQUETA_MODALIDAD,
  TONO_ESTADO,
  type CotizacionDespachable,
  type EstadoGuia,
  type FiltrosGuias,
  type GuiaDetalle,
  type GuiaLista,
  type LineaGuia,
  type ModalidadTraslado,
  type MotivoTraslado,
} from "./dominio/tipos";
