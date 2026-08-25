/**
 * Módulo de recepciones: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaRecepciones } from "./ui/pagina";
export { default as PaginaNuevaRecepcion } from "./ui/pagina-nueva";
export { default as PaginaDetalleRecepcion } from "./ui/pagina-detalle";

// El prorrateo de gastos es una réplica exacta de lo que hace
// `recepcionar_mercaderia()` en Postgres, y está probado contra sus mismos
// números. Lo va a necesitar el kardex para explicar de dónde sale un costo, y
// el módulo de compras para estimar el costo final antes de comprar.
export {
  baseValorizada,
  costearRecepcion,
  factorGastos,
  type CosteoRecepcion,
  type LineaCosteable,
  type LineaCosteada,
} from "./dominio/costeo";

// El estado del registro es un reducer PURO: se puede probar sin React, y lo
// reutilizará la recepción contra una compra desde el módulo de compras.
export {
  aPayload,
  avisos,
  bloqueos,
  costeoDe,
  estadoInicial,
  reducir,
  type Accion,
  type EstadoRecepcion,
  type LineaRecibida,
  type ProductoParaRecibir,
} from "./dominio/constructor";

export type {
  CompraPendiente,
  FiltrosRecepciones,
  LineaPendiente,
  LineaRecepcion,
  ProveedorOpcion,
  RecepcionDetalle,
  RecepcionLista,
} from "./dominio/tipos";
