/**
 * Tipos del módulo de recepciones.
 *
 * La recepción es donde entra el stock. Willy fue explícito (25:21): *"el
 * stock se mueve al recibir la mercadería"*, no con la orden ni con la
 * factura. Por eso `recepcionar_mercaderia()` es, según su propio comentario
 * en 004_funciones.sql, «el único camino por el que entra stock».
 */

/** Una fila del listado de recepciones. */
export interface RecepcionLista {
  id: string;
  numero: string;
  fecha: string;
  proveedor: string | null;
  compra_numero: string | null;
  guia_proveedor: string | null;
  factura_proveedor: string | null;
  recibido_por: string | null;
  anulada: boolean;
  /** Cuántas líneas trae. Sale de un conteo, no de traer los ítems. */
  items: number;
  /** Suma de cantidad × costo, sin prorratear gastos. */
  valorizado: number;
}

/** Una línea de la ficha de una recepción ya registrada. */
export interface LineaRecepcion {
  id: string;
  producto_id: string;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  /** El costo TAL COMO SE GRABÓ en `recepcion_items`: sin gastos prorrateados. */
  costo_unitario: number;
  importe: number;
}

/** La ficha completa de una recepción. */
export interface RecepcionDetalle {
  id: string;
  numero: string;
  fecha: string;
  proveedor: string | null;
  proveedor_documento: string | null;
  compra_id: string | null;
  compra_numero: string | null;
  guia_proveedor: string | null;
  factura_proveedor: string | null;
  recibido_por: string | null;
  observaciones: string | null;
  anulada: boolean;
  creado_en: string;
  lineas: LineaRecepcion[];
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosRecepciones {
  q?: string;
  proveedor?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
}

/** Un proveedor, para el desplegable del registro. */
export interface ProveedorOpcion {
  id: string;
  codigo: string;
  razon_social: string;
  numero_documento: string | null;
  /** `local` o `importacion`. Cambia qué campos tienen sentido. */
  tipo: string;
}

/** Una línea de compra que todavía no se ha recibido del todo. */
export interface LineaPendiente {
  producto_id: string;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
}

/**
 * Una compra con mercadería pendiente de llegar.
 *
 * `gastos_importacion` viaja hasta aquí porque la pantalla necesita
 * PREVISUALIZAR el prorrateo antes de guardar: es la diferencia entre el costo
 * que teclea el operador y el que va a acabar en el kardex.
 */
export interface CompraPendiente {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string;
  proveedor: string;
  gastos_importacion: number;
  lineas: LineaPendiente[];
}
