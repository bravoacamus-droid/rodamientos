/**
 * Contrato de la tabla del ERP.
 *
 * La tabla NO consulta datos: los recibe ya paginados desde un Server
 * Component. Lo único que hace por su cuenta es escribir en los search params
 * de la URL, y el servidor vuelve a consultar con esos parámetros. Eso hace
 * que cada estado de la tabla —filtro, orden, página— sea una URL compartible
 * y que el botón "atrás" del navegador funcione.
 */
import type { RowData } from "@tanstack/react-table";

/* -------------------------------------------------- Metadatos de columna --- */

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma la fija TanStack
  interface ColumnMeta<TData extends RowData, TValue> {
    /** `derecha` activa además `tabular-nums`. Todo importe va a la derecha. */
    alineacion?: "izquierda" | "centro" | "derecha";
    /** Ancho fijo, p. ej. `"9rem"`. Sin esto la columna se reparte el sobrante. */
    ancho?: string;
    /** Nombre legible para menús de columnas y para el `aria-label` del orden. */
    etiqueta?: string;
    /** Fija la columna al hacer scroll horizontal (SKU, número de documento). */
    fija?: boolean;
    /** Oculta la columna al imprimir (acciones, checkbox de selección). */
    sinImprimir?: boolean;
  }
}

/* ------------------------------------------------ Parámetros de la URL ----- */

/** Nombres de los search params. Un solo sitio para cambiarlos. */
export const PARAMS = {
  /** `campo:asc` | `campo:desc` */
  orden: "orden",
  /** Clave de la última/primera fila de la página actual. */
  cursor: "cursor",
  /** `sig` (hacia adelante) | `ant` (hacia atrás). */
  direccion: "dir",
  /** Término de búsqueda libre. */
  busqueda: "q",
  /** Filas por página. */
  tamano: "n",
} as const;

export type Direccion = "sig" | "ant";

export interface OrdenTabla {
  campo: string;
  descendente: boolean;
}

/** Traduce `"sku:desc"` a un objeto. Devuelve null si el texto no es válido. */
export function leerOrden(valor: string | null | undefined): OrdenTabla | null {
  if (!valor) return null;
  const [campo, sentido] = valor.split(":");
  if (!campo) return null;
  return { campo, descendente: sentido === "desc" };
}

export function escribirOrden(orden: OrdenTabla): string {
  return `${orden.campo}:${orden.descendente ? "desc" : "asc"}`;
}

/* ------------------------------------------------ Página de resultados ----- */

/**
 * Lo que devuelve una consulta paginada por keyset.
 *
 * Keyset y no offset: con 2.000+ SKU el `OFFSET` obliga a Postgres a recorrer
 * y descartar todas las filas anteriores, así que la página 40 cuesta 40 veces
 * la página 1. Con keyset la consulta lleva siempre un `WHERE clave > cursor`
 * que ataca el índice, y cuesta lo mismo esté donde esté.
 *
 * Precio a pagar: no hay salto directo a la página N ni número total de
 * páginas. Para un listado operativo —donde se busca y se filtra, no se
 * pasean 40 páginas— es un cambio que sale a favor.
 */
export interface PaginaKeyset<TDato> {
  filas: TDato[];
  /** Clave de la ÚLTIMA fila. `null` cuando ya no hay más hacia adelante. */
  cursorSiguiente: string | null;
  /** Clave de la PRIMERA fila. `null` cuando estamos en la primera página. */
  cursorAnterior: string | null;
  /**
   * Total de registros que cumplen el filtro. Opcional a propósito: contar
   * exacto sobre el catálogo entero es caro. Cuando no se pueda, mándalo como
   * `undefined` y la paginación dirá "mostrando N" sin inventarse un total.
   */
  total?: number;
}

export type EstadoTabla = "listo" | "cargando" | "error";
