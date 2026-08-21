/**
 * Módulo de cotizaciones: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaCotizaciones } from "./ui/pagina";
export { default as PaginaNuevaCotizacion } from "./ui/pagina-nueva";
export { default as PaginaDetalleCotizacion } from "./ui/pagina-detalle";

// El papel: las seis correcciones de Willy (C1-C6) viven aquí y están probadas.
// Facturación reusará el mismo criterio de columnas.
export {
  armarCotizacionImpresa,
  limpiarDescripcion,
  sumarDias,
  type CotizacionImpresa,
  type DatosImpresion,
} from "./dominio/impresion";

export {
  enlaceWhatsapp,
  formatoFecha,
  mensajeCotizacion,
  normalizarTelefono,
} from "./dominio/whatsapp";

// El estado del constructor es un reducer PURO: se puede probar sin React, y
// lo reutilizará la edición de una cotización existente y el "clonar".
export {
  aPayload,
  bloqueos,
  ENTREGAS,
  estadoInicial,
  lineasSinStock,
  reducir,
  revisionDe,
  totalesDe,
  type Accion,
  type EstadoConstructor,
  type LineaConstructor,
  type ProductoParaCotizar,
} from "./dominio/constructor";

// El cálculo de totales lo reutiliza facturación: una factura hecha desde una
// cotización tiene que dar exactamente el mismo importe, o SUNAT la observa.
export {
  calcularTotales,
  importeLinea,
  margenLinea,
  valorParaMargen,
  redondear2,
  redondear4,
  type LineaCalculo,
  type TotalesCotizacion,
} from "./dominio/totales";

// El piso de venta (P.M.). Lo usa el constructor para avisar en vivo, y
// facturación para no dejar que una factura hecha desde una cotización termine
// por debajo del piso si alguien editó el precio en el camino.
export {
  descuentoMaximoPct,
  lineasBajoPiso,
  precioNeto,
  revisarPiso,
  valorUnitarioMinimo,
  type LineaBajoPiso,
  type LineaConPiso,
  type RevisionPiso,
} from "./dominio/piso";

export type {
  CotizacionDetalle,
  CotizacionLista,
  EstadoCotizacion,
  FiltrosCotizaciones,
  LineaCotizacion,
} from "./dominio/tipos";
