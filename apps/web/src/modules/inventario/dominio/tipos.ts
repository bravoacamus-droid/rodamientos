/**
 * Tipos del módulo de inventario.
 *
 * Tres pantallas que comparten datos: la valorización (24:21, *"su sistema
 * actual no se la da"*), el kardex, y el cuadre de gerencia (26:49, *"un botón
 * que lo va a usar con cuidado"*).
 *
 * Casi todo sale de vistas ya escritas —`v_valorizacion_inventario`,
 * `v_kardex`, `v_reposicion`—, así que estos tipos espejan lo que devuelven.
 */

/** Cómo está un producto frente a sus topes. Lo decide Postgres. */
export type EstadoStock =
  | "negativo"
  | "sin_stock"
  | "critico"
  | "sobrestock"
  | "normal";

/** Una fila de `v_valorizacion_inventario`, agregada por subfamilia. */
export interface FilaValorizacion {
  familia_id: string;
  familia: string;
  subfamilia_id: string;
  subfamilia: string;
  skus: number;
  skus_con_stock: number;
  unidades: number;
  valor_costo: number;
  valor_venta: number;
  margen_potencial: number;
}

/** Los cuatro números de la cabecera. */
export interface ResumenInventario {
  valorCosto: number;
  valorVenta: number;
  margenPotencial: number;
  unidades: number;
  skus: number;
  skusConStock: number;
}

/** Una fila de `v_reposicion`: lo que hay que comprar o lo que sobra. */
export interface FilaReposicion {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string;
  familia: string;
  subfamilia: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  estado_stock: EstadoStock;
  costo_promedio: number;
  precio_venta: number;
  valorizado: number;
  sugerido_comprar: number;
  consumo_diario: number;
  /** Cuántos días aguanta el saldo al ritmo de los últimos 90 días. */
  dias_cobertura: number | null;
}

export type TipoMovimiento =
  | "ingreso"
  | "salida"
  | "ajuste_positivo"
  | "ajuste_negativo";

/** Una fila de `v_kardex`. Entrada y salida ya vienen separadas. */
export interface FilaKardex {
  id: number;
  fecha: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  tipo: TipoMovimiento;
  entrada: number;
  salida: number;
  costo_unitario: number;
  saldo_cantidad: number;
  saldo_valorizado: number;
  costo_promedio: number;
  referencia_tipo: string | null;
  referencia_id: string | null;
  referencia_numero: string | null;
  motivo: string | null;
  usuario: string | null;
}

/** Filtros del kardex. Viajan en los search params, así que todo es texto. */
export interface FiltrosKardex {
  producto?: string;
  tipo?: string;
  referencia?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
}

/** Filtros con los que se carga la hoja de conteo del cuadre. */
export interface FiltrosConteo {
  familia?: string;
  marca?: string;
  /** Contar solo lo que el sistema cree que existe. */
  soloConStock?: boolean;
}

/** Un producto listo para contarse. */
export interface ProductoContable {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string;
  subfamilia: string;
  unidad: string;
  stock: number;
  costo_promedio: number;
}

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  salida: "Salida",
  ajuste_positivo: "Ajuste +",
  ajuste_negativo: "Ajuste −",
};

/** Los cuatro motivos que admite `tipo_ajuste` en la base. */
export const TIPOS_AJUSTE = [
  { valor: "descuadre", etiqueta: "Descuadre de conteo" },
  { valor: "cuadre_inicial", etiqueta: "Cuadre inicial" },
  { valor: "merma", etiqueta: "Merma" },
  { valor: "devolucion_interna", etiqueta: "Devolución interna" },
] as const;

export type TipoAjuste = (typeof TIPOS_AJUSTE)[number]["valor"];
