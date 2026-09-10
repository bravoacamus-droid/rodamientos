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

/* -------------------------------------------------- Filas por página ------- */

/**
 * Los tamaños que ofrece el selector.
 *
 * Vive aquí y no dentro del componente porque hacen falta en dos sitios que no
 * se hablan: el `<select>` que los pinta y el servidor que valida lo que llega
 * por la URL. Con la lista solo en el componente, el servidor no tenía con qué
 * comparar — y no comparaba.
 */
export const TAMANOS_PAGINA = [25, 50, 100, 200] as const;

/** El que se usa si no se pide otro. */
export const TAMANO_POR_DEFECTO = 50;

/**
 * Cuántas filas traer, leído de la URL.
 *
 * Luis, 10/09: *«el componente de las listas: pongo 25 y no se ponen 25, queda
 * en 50»*. Y era verdad en TODAS las tablas del ERP: el selector escribía
 * `?n=25` y ninguna página lo leía. La lista se traía con el límite fijo del
 * módulo —30 en facturación, 50 en el resto— y el selector se quedaba pintando
 * un número que no mandaba nada.
 *
 * Es un endpoint público como cualquier otro: `?n=100000` sería una consulta
 * que tumba la página, así que solo pasan los cuatro de la lista.
 */
export function leerTamano(valor: string | null | undefined): number {
  const n = Number(valor);
  return (TAMANOS_PAGINA as readonly number[]).includes(n) ? n : TAMANO_POR_DEFECTO;
}
