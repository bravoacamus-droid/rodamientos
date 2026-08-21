/**
 * Tipos del módulo de productos.
 *
 * Espejan lo que devuelve `productos_pagina()` en 004_funciones.sql. Si esa
 * función cambia su tabla de retorno, esto cambia con ella.
 */

/**
 * Cómo está el stock frente a sus topes. Lo calcula Postgres, no la interfaz.
 *
 * `negativo` existe a propósito: se permite vender por reponer, y un saldo
 * bajo cero tiene que verse como lo que es en vez de quedar disfrazado de
 * "sin stock".
 */
export type EstadoStock =
  | "negativo"
  | "sin_stock"
  | "critico"
  | "sobrestock"
  | "normal";

/** Una fila del listado. Ya viene con la jerarquía y la marca resueltas. */
export interface ProductoLista {
  id: string;
  codigo: string;
  codigo_norm: string;
  codigo_fabricante: string | null;
  descripcion: string;
  /** Columna propia, nunca dentro de la descripción (corrección C2). */
  marca: string;
  familia: string;
  subfamilia: string;
  tipo: string | null;
  unidad: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  precio_venta: number;
  precio_promedio: number;
  costo_promedio: number;
  archivado: boolean;
  estado_stock: EstadoStock;
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosProductos {
  q?: string;
  familia?: string;
  subfamilia?: string;
  tipo?: string;
  marca?: string;
  archivados?: boolean;
  cursor?: string;
}

/** Opción de un desplegable de filtro. */
export interface Opcion {
  id: string;
  nombre: string;
  /** Solo en subfamilias: permite limitarlas a la familia elegida. */
  familia_id?: string;
}

/** Indicadores de la cabecera. */
export interface ResumenCatalogo {
  total: number;
  sinStock: number;
  criticos: number;
  sobrestock: number;
  valorizado: number;
}

/** Etiqueta de cada estado de stock. */
export const ETIQUETA_STOCK: Record<EstadoStock, string> = {
  negativo: "Negativo",
  sin_stock: "Sin stock",
  critico: "Por agotarse",
  sobrestock: "Sobrestock",
  normal: "Normal",
};

/**
 * Color de cada estado. Semántico, no decorativo: lo que exige atención se ve
 * distinto de un vistazo, sin tener que leer la etiqueta.
 */
export const COLOR_STOCK: Record<EstadoStock, string> = {
  negativo: "bg-[var(--danger-bg)] text-[var(--danger)]",
  sin_stock: "bg-[var(--danger-bg)] text-[var(--danger)]",
  critico: "bg-[var(--warn-bg)] text-[var(--warn)]",
  sobrestock: "bg-[var(--info-bg)] text-[var(--info)]",
  normal: "bg-[var(--ok-bg)] text-[var(--ok)]",
};
