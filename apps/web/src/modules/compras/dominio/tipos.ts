/**
 * Tipos del módulo de compras.
 *
 * La compra es el compromiso con el proveedor; la recepción es lo que mueve el
 * stock. Willy fue explícito (25:21): *"el stock se mueve al recibir la
 * mercadería"*. Por eso aquí no aparece nada de kardex: registrar una compra no
 * toca inventario, y `crear_compra()` lo dice en su propio comentario.
 *
 * Willy tampoco usa orden de compra formal (30:01): pide por WhatsApp o por
 * correo y ya. Lo que se registra es la compra hecha, no una orden que alguien
 * tenga que aprobar.
 */

/** Los dos tipos de compra que distingue la base. */
export type TipoCompra = "local" | "importacion";

/** Estados de `estado_compra`. */
export type EstadoCompra =
  | "registrada"
  | "recibida_parcial"
  | "recibida"
  | "anulada";

export const ETIQUETA_ESTADO: Record<EstadoCompra, string> = {
  registrada: "Registrada",
  recibida_parcial: "Parcial",
  recibida: "Recibida",
  anulada: "Anulada",
};

/**
 * Tono de la insignia por estado.
 *
 * «Parcial» es aviso y no éxito a propósito: una compra a medio recibir es
 * justo la que hay que perseguir, y pintarla en verde la esconde entre las que
 * ya están cerradas.
 */
export const TONO_ESTADO: Record<EstadoCompra, "neutral" | "warning" | "success" | "danger"> = {
  registrada: "neutral",
  recibida_parcial: "warning",
  recibida: "success",
  anulada: "danger",
};

/** Una fila del listado. */
export interface CompraLista {
  id: string;
  numero: string;
  fecha: string;
  fecha_estimada: string | null;
  proveedor: string | null;
  tipo: TipoCompra;
  documento_proveedor: string | null;
  estado: EstadoCompra;
  total: number;
  gastos_importacion: number;
  /** Cuántas líneas trae. */
  items: number;
  /**
   * Qué porcentaje de lo pedido ya llegó, de 0 a 100.
   *
   * Se calcula sobre CANTIDADES, no sobre líneas: recibir 9 de 10 referencias
   * pero faltando la que trae 500 unidades no es «90 % recibido».
   */
  avance: number;
}

/** Una línea de la ficha de una compra. */
export interface LineaCompra {
  id: string;
  producto_id: string;
  codigo: string;
  marca: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
  importe: number;
}

/** La ficha completa. */
export interface CompraDetalle {
  id: string;
  numero: string;
  fecha: string;
  fecha_estimada: string | null;
  proveedor_id: string;
  proveedor: string | null;
  proveedor_documento: string | null;
  tipo: TipoCompra;
  documento_proveedor: string | null;
  guia_proveedor: string | null;
  tracking: string | null;
  courier: string | null;
  estado: EstadoCompra;
  subtotal: number;
  igv: number;
  total: number;
  gastos_importacion: number;
  comprador: string | null;
  observaciones: string | null;
  motivo_anulacion: string | null;
  creado_en: string;
  lineas: LineaCompra[];
  /** Recepciones que han consumido esta compra. */
  recepciones: { id: string; numero: string; fecha: string }[];
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosCompras {
  q?: string;
  proveedor?: string;
  estado?: string;
  tipo?: string;
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
  tipo: string;
  /** Días de crédito que da él. Se enseña al elegirlo, como referencia. */
  dias_pago: number;
  /** Plazo habitual de entrega, para proponer la fecha estimada. */
  lead_time_dias: number;
}
