/**
 * «Ver más» en vez de páginas (19/11).
 *
 * Luis, sobre el kardex y las recepciones: *«que no sea tan largo, que salga
 * el ver más, y el número de filas reducelo a 30»*. Con páginas, Willy tenía
 * que entender «siguiente / anterior» y un selector de filas; con «Ver más»
 * la lista empieza corta y crece donde está mirando, sin perder lo de arriba.
 *
 * Cada pantalla elige su tanda: el kardex va de 20 en 20 (Luis, 19/11: «sigue
 * viéndose mucho»), porque cada movimiento ocupa más alto que una recepción.
 *
 * Cuántas se enseñan va en la URL (`?n=40`), como el resto de los filtros:
 * así «atrás» y un enlace mandado por WhatsApp abren la lista igual. Es un
 * endpoint público, así que solo pasan múltiplos de la tanda y con tope: un
 * `?n=100000` no puede convertirse en una consulta que tumbe la página.
 */

/** De a cuántas filas crece la lista, si la pantalla no pide otra cosa. */
export const TANDA = 30;

/** A partir de aquí la lista no crece más: lo que sigue se baja en Excel. */
export const TOPE_VER_MAS = 600;

export function leerCuantos(valor: string | string[] | null | undefined, tanda = TANDA): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < tanda) return tanda;
  // Se redondea a la tanda por debajo: con tanda 30, `?n=45` enseña 30.
  return Math.min(Math.floor(n / tanda) * tanda, Math.floor(TOPE_VER_MAS / tanda) * tanda);
}

/** La misma búsqueda con `n` cambiado; la primera tanda lo quita, porque es la de siempre. */
export function conCuantos(query: string, n: number, tanda = TANDA): string {
  const p = new URLSearchParams(query);
  p.delete("n");
  p.delete("cursor");
  p.delete("dir");
  if (n !== tanda) p.set("n", String(n));
  const s = p.toString();
  return s ? `?${s}` : "?";
}
