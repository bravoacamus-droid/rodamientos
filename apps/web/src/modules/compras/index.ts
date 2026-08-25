/**
 * Módulo de compras: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaCompras } from "./ui/pagina";
export { default as PaginaNuevaCompra } from "./ui/pagina-nueva";
export { default as PaginaDetalleCompra } from "./ui/pagina-detalle";

// El estado del registro es un reducer PURO: se puede probar sin React. Se
// publica porque cobranzas va a necesitar los mismos totales para cuadrar lo
// que se le debe a cada proveedor.
export {
  aPayload,
  avisos,
  bloqueos,
  estadoInicial,
  importeLinea,
  reducir,
  totalesDe,
  type Accion,
  type EstadoCompra as EstadoConstructorCompra,
  type LineaCompraEditable,
  type ProductoParaComprar,
  type TotalesCompra,
} from "./dominio/constructor";

export {
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  type CompraDetalle,
  type CompraLista,
  type EstadoCompra,
  type FiltrosCompras,
  type LineaCompra,
  type ProveedorOpcion,
  type TipoCompra,
} from "./dominio/tipos";
