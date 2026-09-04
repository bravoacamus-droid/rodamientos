/**
 * Módulo de compras: superficie pública.
 *
 * Lo que no esté aquí es privado del módulo. Ver apps/web/src/modules/README.md.
 */

export { default as PaginaCompras } from "./ui/pagina";
export { default as PaginaNuevaCompra } from "./ui/pagina-nueva";
export { default as PaginaDetalleCompra } from "./ui/pagina-detalle";
export { default as PaginaPorComprar } from "./ui/por-comprar/pagina";
export { default as PaginaListos } from "./ui/pagina-listos";
export { default as PaginaPedirPrecio } from "./ui/pedir-precio/pagina";
export { default as PaginaPrecios } from "./ui/precios/pagina";
export { default as PaginaComparativa } from "./ui/precios/pagina-detalle";

// El comparador. Se publica la cuenta y no la pantalla: el tablero va a
// querer «cuántas consultas están esperando respuesta», y la ficha de
// producto, a cuánto se lo dejaron la última vez.
export {
  ETIQUETA_RESPUESTA,
  aUsdSinIgv,
  compararTodo,
  comprasPropuestas,
  costoParaCompra,
  eleccionPorDefecto,
  ganadorDe,
  resumirComparativa,
  resumirProveedores,
  type Celda,
  type EstadoRespuesta,
  type FilaComparada,
  type Ganador,
  type ItemConsultado,
  type Moneda,
  type ProveedorConsultado,
  type Respuesta,
  type ResumenComparativa,
  type ResumenProveedor,
} from "./dominio/comparador";

// El reparto del stock entre los clientes que esperan lo mismo. Se publica
// porque el comparador de proveedores —el siguiente paso del plan— parte de
// estas mismas filas, y porque el tablero va a querer el resumen.
// La bandeja se publica porque la ficha de la cotización pregunta «¿qué le
// falta a ESTE pedido?», y esa cuenta tiene que ser la misma que la de la
// bandeja: el stock se reparte entre todos los que esperan, y dos pantallas
// con cifras distintas para la misma pregunta no se las cree nadie.
export { bandejaPorComprar } from "./api/por-comprar";

export {
  ETIQUETA_URGENCIA,
  agruparPorComprar,
  loQueFaltaDe,
  resumirPorComprar,
  type LineaComprometida,
  type PedidoPendiente,
  type FaltaDelPedido,
  type ProductoPorComprar,
  type ResumenPorComprar,
  type Urgencia,
} from "./dominio/por-comprar";

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
