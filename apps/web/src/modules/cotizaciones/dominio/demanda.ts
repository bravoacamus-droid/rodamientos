import { redondear2 } from "./totales";

/**
 * Cuántos piden lo mismo (09/10).
 *
 * Luis: *«si justo dos o tres cotizaciones están pidiendo lo mismo […] diciendo
 * "2 ítems de este producto están en otra cotización", con un botón de ver […]
 * a qué cliente y qué cotización; a la hora de comprar también tiene que
 * decirle cuántos ítems tiene que comprar, siempre y cuando se apruebe la
 * cotización; si no, no: es como un borrador, porque primero me tiene que
 * confirmar si van a llevar todo o solo una parte»*.
 *
 * Así que dos listas que no pesan igual: las APROBADAS cuentan para comprar;
 * las que están en borrador o enviadas se enseñan y no suman.
 *
 * Salió de la prueba de punta a punta del 09/10: se compraron 10 para
 * REACTIVOS, COFACO tenía 6 aprobados de antes, y el reparto por orden de
 * confirmación le dio 6 de los 10 a COFACO.
 */

export interface PedidoDelProducto {
  cotizacionId: string;
  numero: string;
  cliente: string;
  fecha: string;
  /** Aprobadas: lo confirmado que falta entregar. Sin confirmar: lo cotizado. */
  cantidad: number;
  estado: "aprobada" | "borrador" | "enviada";
}

export interface DemandaProducto {
  productoId: string;
  aprobadas: PedidoDelProducto[];
  sinConfirmar: PedidoDelProducto[];
  stock: number;
  /** Lo pedido a proveedores y todavía no recibido. */
  enCamino: number;
}

/** Lo que piden los OTROS (sin la cotización que se está mirando). */
export function otrosPedidos(d: DemandaProducto | undefined, actual: string | null) {
  const aprobadas = (d?.aprobadas ?? []).filter((p) => p.cotizacionId !== actual);
  const sinConfirmar = (d?.sinConfirmar ?? []).filter((p) => p.cotizacionId !== actual);
  return {
    aprobadas,
    sinConfirmar,
    total: aprobadas.length + sinConfirmar.length,
    cantidadAprobada: redondear2(aprobadas.reduce((s, p) => s + p.cantidad, 0)),
  };
}

/**
 * Cuánto hay que comprar del producto para cubrir TODOS los pedidos
 * aprobados: lo confirmado, menos el stock, menos lo que ya viene.
 */
export function faltaComprar(d: DemandaProducto | undefined): number {
  if (!d) return 0;
  const pedido = d.aprobadas.reduce((s, p) => s + p.cantidad, 0);
  return redondear2(Math.max(0, pedido - d.stock - d.enCamino));
}

/**
 * Cuántas más hacen falta para los otros pedidos, dadas las que ya se van a
 * pedir en las órdenes que se están armando.
 */
export function faltanParaOtros(d: DemandaProducto | undefined, yaSePiden: number): number {
  return redondear2(Math.max(0, faltaComprar(d) - yaSePiden));
}
