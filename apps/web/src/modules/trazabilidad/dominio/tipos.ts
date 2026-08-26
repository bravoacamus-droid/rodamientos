/**
 * Tipos de la trazabilidad por ítem.
 *
 * Lo que esta pantalla responde, en palabras de Willy (26/08, 32:45):
 *
 *   «Quería saber uno de los ítems. ¿A qué precio le he cotizado antes? ¿Y a
 *    quién le he comprado? ¿Y a qué precio?»
 *
 * Y por qué importa:
 *
 *   «Si lo he comprado ahí es porque ya lo he analizado y he visto que es el
 *    mejor precio del mercado. La idea es no volver a hacer ese estudio de
 *    mercado.»
 *
 * O sea: no es un informe, es lo que evita repetir el trabajo caro. Un cliente
 * le armó una orden con cinco ítems sacados de cotizaciones viejas distintas y
 * él tuvo que rebuscar por WhatsApp para saber a cuánto los había ofrecido.
 */

/** De qué lado del negocio viene el evento. */
export type Lado = "compra" | "venta";

/** Los cinco eventos de la línea de tiempo, en orden de flujo. */
export type Evento =
  | "compra"
  | "recepcion"
  | "cotizacion"
  | "factura"
  | "nota_credito"
  | "nota_debito";

export const ETIQUETA_EVENTO: Record<Evento, string> = {
  compra: "Orden de compra",
  recepcion: "Entró al almacén",
  cotizacion: "Cotizado",
  factura: "Vendido",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

/**
 * Qué significa cada evento para el precio que se ve en la fila.
 *
 * La distinción entre la orden de compra y la recepción no es burocrática: la
 * primera dice lo que se pactó con el proveedor y la segunda lo que costó
 * puesto en almacén, con los gastos de importación ya repartidos. Cuando las
 * dos cifras se separan, la diferencia es el flete.
 */
export const AYUDA_EVENTO: Record<Evento, string> = {
  compra: "Lo que se pactó con el proveedor.",
  recepcion: "Lo que costó puesto en almacén, con los gastos ya repartidos.",
  cotizacion: "Lo que se le ofreció al cliente.",
  factura: "Lo que se le vendió de verdad.",
  nota_credito: "Devolución o corrección a la baja. No cuenta como venta.",
  nota_debito: "Corrección al alza. No cuenta como venta.",
};

/** Un evento de la línea de tiempo. Una fila de `v_trazabilidad_item`. */
export interface EventoTrazabilidad {
  producto_id: string;
  /** Con hora en la recepción, a medianoche en el resto. Usa `dia` para ordenar. */
  fecha: string;
  /** La fecha sin hora. Es la que agrupa y la que ordena. */
  dia: string;
  lado: Lado;
  evento: Evento;
  documento_id: string;
  documento: string;
  /** El proveedor o el cliente, según el lado. */
  contraparte_id: string | null;
  contraparte: string | null;
  contraparte_doc: string | null;
  cantidad: number;
  unitario: number;
  importe: number;
  estado: string;
  /** La OC del cliente, o el documento del proveedor. */
  referencia: string | null;
  /** Orden dentro del día: 1 compra … 5 nota. */
  secuencia: number;
}

/** Una contraparte y su precio, tal como los devuelve `resumen_trazabilidad`. */
export interface Referencia {
  id: string | null;
  nombre: string | null;
  unitario: number;
  fecha: string;
  documento: string;
  estado?: string;
}

/** La cabecera: lo que se lee antes de bajar a la línea de tiempo. */
export interface ResumenTrazabilidad {
  eventos: number;
  /** El más barato de los que sí nos han vendido esto. */
  mejorProveedor: Referencia | null;
  ultimaCompra: Referencia | null;
  proveedores: number;
  ultimaCotizacion: Referencia | null;
  ultimaVenta: Referencia | null;
  clientes: number;
  unidadesVendidas: number;
  cotizadoMin: number | null;
  cotizadoMax: number | null;
}

/** Filtros de la pantalla. Viajan en los search params, así que todo es texto. */
export interface FiltrosTrazabilidad {
  /** `compra` o `venta` para quedarse con un solo lado. */
  lado?: string;
  /** `1` para ver solo las contrapartes, sin el detalle documento a documento. */
  contraparte?: string;
}
