// Sale del enum `estado_cotizacion` de Postgres, no de una lista a mano.
//
// Escrita a mano decía "facturada", que nunca existió en el esquema, y le
// faltaban "atendida" y "anulada". El filtro compilaba igual y devolvía cero
// siempre. Importándolo, agregar un estado en la base y no contemplarlo aquí
// rompe el typecheck, que es lo que queremos.
//
// Es un import SOLO de tipos: no mete nada en el bundle ni ata el dominio a
// Supabase en tiempo de ejecución.
import type { EstadoCotizacion } from "@rodatech/db/tipos";

export type { EstadoCotizacion };

import type { Disponibilidad } from "./disponibilidad";
export type { Disponibilidad };

/** Una fila del listado. */
export interface CotizacionLista {
  id: string;
  numero: string;
  fecha: string;
  fecha_vencimiento: string;
  cliente_id: string;
  cliente: string;
  cliente_documento: string | null;
  orden_compra_cliente: string | null;
  subtotal: number;
  igv: number;
  total: number;
  margen_pct: number;
  estado: EstadoCotizacion;
  vendedor: string | null;
  items: number;
}

/**
 * Una línea, tal como se imprime.
 *
 * El orden de los campos es el de las columnas del PDF acordadas con el
 * cliente (C4): código, marca, descripción, cantidad, unidad, valor unitario,
 * [descuento] e importe.
 *
 * No existe ningún campo de "precio unitario con IGV" (C1): esa columna se
 * eliminó del modelo, no solo de la vista.
 */
export interface LineaCotizacion {
  id: string;
  orden: number;
  producto_id: string | null;
  codigo: string;
  /** Columna propia, nunca dentro de la descripción (C2). */
  marca: string | null;
  /** Sin el código repetido dentro (C3). */
  descripcion: string;
  cantidad: number;
  unidad_codigo: string;
  valor_unitario: number;
  descuento_pct: number;
  importe: number;
  costo_unitario: number;
  entrega: string | null;
  /** 040: cuándo puede entregarse esta línea. */
  disponibilidad: Disponibilidad;
  /** Plazo propio. Null = el habitual de su tipo. */
  dias_entrega: number | null;
  /** 041: lo que el cliente confirmó. Null = todavía no ha contestado. */
  cantidad_aprobada: number | null;
}

/** Cabecera completa, para la ficha y el PDF. */
export interface CotizacionDetalle {
  id: string;
  numero: string;
  serie: string;
  correlativo: number;
  fecha: string;
  validez_dias: number;
  fecha_vencimiento: string;
  cliente_id: string;
  cliente: string;
  cliente_documento: string | null;
  cliente_direccion: string | null;
  contacto: string | null;
  orden_compra_cliente: string | null;
  subtotal: number;
  descuento_total: number;
  igv: number;
  total: number;
  costo_total: number;
  margen_pct: number;
  /** Si está apagada, la columna Descuento no se imprime (C5). */
  mostrar_descuento: boolean;
  estado: EstadoCotizacion;
  vendedor: string | null;
  condiciones: string | null;
  observaciones: string | null;
  tiempo_entrega: string | null;
  aprobada_en: string | null;
  items: LineaCotizacion[];
}

export interface FiltrosCotizaciones {
  q?: string;
  estado?: EstadoCotizacion;
  cliente?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
}

export const ETIQUETA_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  vencida: "Vencida",
  atendida: "Atendida",
  anulada: "Anulada",
};

/** Color semántico por estado: lo que exige acción se distingue de un vistazo. */
/**
 * Riel de color del estado, a la izquierda de cada fila.
 *
 * Es la única señal cromática del listado y sustituye a mirar la columna de
 * Estado: en una lista de treinta cotizaciones el ojo encuentra las azules
 * —las enviadas, las que esperan respuesta— sin leer una sola palabra.
 *
 * Va aparte de COLOR_ESTADO porque aquella pinta una pastilla con fondo y
 * texto, y esto es un borde de tres píxeles. Mezclarlas obligaba a recortar
 * clases con expresiones regulares.
 */
export const RIEL_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: "bg-[var(--border-strong)]",
  enviada: "bg-[var(--info)]",
  aprobada: "bg-[var(--ok)]",
  rechazada: "bg-[var(--danger)]",
  vencida: "bg-[var(--warn)]",
  atendida: "bg-brand-600",
  anulada: "bg-[var(--border)]",
};

export const COLOR_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: "bg-[var(--surface-2)] text-[var(--fg-muted)]",
  enviada: "bg-[var(--info-bg)] text-[var(--info)]",
  aprobada: "bg-[var(--ok-bg)] text-[var(--ok)]",
  rechazada: "bg-[var(--danger-bg)] text-[var(--danger)]",
  vencida: "bg-[var(--warn-bg)] text-[var(--warn)]",
  atendida: "bg-brand-50 text-brand-700",
  anulada: "bg-[var(--surface-2)] text-[var(--fg-muted)] line-through",
};

/** ¿Es un estado real del enum? Filtra lo que llegue por la query string. */
export function esEstadoCotizacion(v: unknown): v is EstadoCotizacion {
  return typeof v === "string" && v in ETIQUETA_ESTADO;
}
