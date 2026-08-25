/**
 * Tipos del módulo de guías de remisión.
 *
 * La guía es el documento que acompaña el movimiento FÍSICO de la mercadería,
 * y es **aquí donde el stock deja el almacén** — no en la factura. Lo dice el
 * propio comentario de `emitir_guia()` en 004_funciones.sql, y por eso
 * `emitir_comprobante` trae `descargar_stock` en false por defecto.
 *
 * Nace en BORRADOR a propósito: Willy pidió vista previa antes de emitir
 * (§2.2), y la restricción `guia_transporte_ok` solo exige los datos del
 * transporte cuando la guía deja de ser borrador. O sea que se puede preparar
 * a medias, imprimirla para revisarla, y completarla cuando el camión ya tiene
 * placa y conductor.
 */

/** Los tres estados de `estado_guia`. */
export type EstadoGuia = "borrador" | "emitida" | "anulada";

export const ETIQUETA_ESTADO: Record<EstadoGuia, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  anulada: "Anulada",
};

export const TONO_ESTADO: Record<EstadoGuia, "neutral" | "success" | "danger"> = {
  borrador: "neutral",
  emitida: "success",
  anulada: "danger",
};

/**
 * Modalidad de traslado (catálogo 18 de SUNAT).
 *
 * Solo hay dos y cambian qué datos son obligatorios: en público hace falta el
 * transportista con su RUC; en privado, la placa del vehículo. La base lo
 * exige con `guia_transporte_ok`.
 */
export type ModalidadTraslado = "01" | "02";

export const ETIQUETA_MODALIDAD: Record<ModalidadTraslado, string> = {
  "01": "Transporte público",
  "02": "Transporte privado",
};

/** Un motivo del catálogo 20 de SUNAT. */
export interface MotivoTraslado {
  codigo: string;
  descripcion: string;
}

/** Una fila del listado. */
export interface GuiaLista {
  id: string;
  numero: string;
  fecha_emision: string;
  fecha_traslado: string;
  cliente: string | null;
  cotizacion_numero: string | null;
  motivo: string | null;
  direccion_llegada: string | null;
  peso_bruto_kg: number;
  numero_bultos: number;
  estado: EstadoGuia;
  estado_sunat: string;
  items: number;
}

/** Una línea de la guía. */
export interface LineaGuia {
  id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  peso_kg: number;
}

/** La ficha completa. */
export interface GuiaDetalle {
  id: string;
  serie: string;
  correlativo: number;
  numero: string;
  cliente_id: string;
  cliente: string | null;
  cliente_documento: string | null;
  cotizacion_id: string | null;
  cotizacion_numero: string | null;
  orden_compra_cliente: string | null;
  fecha_emision: string;
  fecha_traslado: string;
  motivo_codigo: string;
  motivo_descripcion: string | null;
  ubigeo_partida: string | null;
  direccion_partida: string | null;
  ubigeo_llegada: string | null;
  direccion_llegada: string | null;
  peso_bruto_kg: number;
  unidad_peso: string;
  numero_bultos: number;
  modalidad_traslado: ModalidadTraslado;
  transportista_documento: string | null;
  transportista_razon_social: string | null;
  transportista_placa: string | null;
  conductor_documento: string | null;
  conductor_nombre: string | null;
  conductor_licencia: string | null;
  entregado_por: string | null;
  recibido_por: string | null;
  estado: EstadoGuia;
  estado_sunat: string;
  sunat_mensaje: string | null;
  observaciones: string | null;
  motivo_anulacion: string | null;
  creado_en: string;
  lineas: LineaGuia[];
  /** El comprobante que se emitió contra esta guía, si ya existe. */
  comprobante: { id: string; numero: string } | null;
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosGuias {
  q?: string;
  cliente?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
}

/** Una cotización aprobada con mercadería pendiente de despachar. */
export interface CotizacionDespachable {
  id: string;
  numero: string;
  fecha: string;
  cliente_id: string;
  cliente: string;
  cliente_documento: string | null;
  cliente_direccion: string | null;
  cliente_ubigeo: string | null;
  orden_compra_cliente: string | null;
  lineas: {
    cotizacion_item_id: string;
    producto_id: string;
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: number;
    /** Cuánto se despachó ya en guías anteriores. */
    despachado: number;
    /** Peso unitario del maestro. Cero si nadie lo registró. */
    peso_kg: number;
  }[];
}
