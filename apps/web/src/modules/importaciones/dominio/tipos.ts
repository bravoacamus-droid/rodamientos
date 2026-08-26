/**
 * Tipos del seguimiento de importaciones.
 *
 * Willy compra fuera en envíos pequeños, por courier, no en contenedores
 * (30:01). Por eso esto NO es un módulo de landed cost con DUA, FOB y ad
 * valorem: es «¿dónde está mi pedido y cuánto me va a costar puesto aquí?».
 *
 * El prorrateo de los gastos ya lo hace la base al recibir
 * (`recepcionar_mercaderia`, corregido en la 022). Lo que faltaba era la
 * pantalla que enseña lo que está en camino y deja detallar en qué se fue el
 * dinero: flete, seguro, aduana.
 */

/** En qué punto está el envío. Se deduce; no es una columna. */
export type EstadoTransito =
  | "en_camino"
  | "atrasada"
  | "parcial"
  | "recibida"
  | "sin_fecha";

export const ETIQUETA_TRANSITO: Record<EstadoTransito, string> = {
  en_camino: "En camino",
  atrasada: "Atrasada",
  parcial: "Llegó a medias",
  recibida: "Recibida",
  sin_fecha: "Sin fecha estimada",
};

/** Una compra del exterior. */
export interface Importacion {
  id: string;
  numero: string;
  proveedor_id: string;
  proveedor: string;
  fecha: string;
  /** Cuándo se espera. Puede faltar: el courier no siempre la da al pedir. */
  fecha_estimada: string | null;
  documento_proveedor: string | null;
  courier: string | null;
  tracking: string | null;
  subtotal: number;
  gastos: number;
  total: number;
  estado: string;
  /** Cuántas líneas y cuántas ya llegaron enteras. */
  lineas: number;
  lineasRecibidas: number;
}

/** Un gasto detallado de una importación. */
export interface GastoImportacion {
  id: string;
  compra_id: string;
  concepto: string;
  monto: number;
  fecha: string;
  documento: string | null;
}

/**
 * Los conceptos que se repiten, para no tener que teclearlos.
 *
 * Es una sugerencia, no una lista cerrada: `gastos_importacion.concepto` es
 * texto libre a propósito, porque el día que aparezca un cargo raro —una
 * multa, un almacenaje— hay que poder anotarlo sin migrar nada.
 */
export const CONCEPTOS_HABITUALES = [
  "Flete internacional",
  "Seguro",
  "Aduana",
  "Courier",
  "Almacenaje",
  "Comisión bancaria",
] as const;

/** Lo que se lee arriba de la pantalla. */
export interface ResumenImportaciones {
  enCamino: number;
  atrasadas: number;
  /** Valor de la mercadería que todavía no ha llegado. */
  valorEnCamino: number;
  /** Gastos de las que siguen abiertas. */
  gastosEnCamino: number;
}

/** Filtros del listado. Viajan en los search params, así que todo es texto. */
export interface FiltrosImportaciones {
  q?: string;
  /** `1` para ver solo lo que sigue en camino. */
  abiertas?: string;
}
