/**
 * Páginas numeradas, leídas de la URL (23/11).
 *
 * Luis, del kardex: *«no tiene paginación, sale con un botón de mostrar más,
 * no; que tenga un select como los demás de mostrar 10, 15, 30, 50, pero
 * igual una paginación»*. El «Ver más» del 19/11 hacía crecer la lista sin
 * fin y no decía cuántas había ni por dónde se iba.
 *
 * La página (`?p=3`) y las filas (`?n=15`) viajan en la URL, como los
 * filtros: «atrás» y un enlace mandado por WhatsApp abren la misma página.
 * Es un endpoint público, así que solo pasan tamaños de la lista y páginas
 * enteras positivas.
 */

/** Los tamaños que ofrece el selector. */
export const FILAS_POR_PAGINA = [10, 15, 30, 50] as const;

/** El de siempre: 15, que cabe en una pantalla sin desplazarse mucho. */
export const FILAS_POR_DEFECTO = 15;

function primero(valor: string | string[] | null | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : (valor ?? undefined);
}

/** `?n=`: solo un tamaño de la lista; cualquier otro, el de por defecto. */
export function leerFilasPorPagina(valor: string | string[] | null | undefined): number {
  const n = Number(primero(valor));
  return (FILAS_POR_PAGINA as readonly number[]).includes(n) ? n : FILAS_POR_DEFECTO;
}

/** `?p=`: un entero desde 1. Lo que no lo sea es la primera página. */
export function leerPagina(valor: string | string[] | null | undefined): number {
  const n = Number(primero(valor));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

/** Cuántas páginas hay para `total` filas (al menos una, aunque esté vacía). */
export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}

/**
 * Los números a pintar: siempre la primera y la última, la actual con una a
 * cada lado, y «…» donde se salta. Con 7 o menos, todas.
 *
 *   ventanaPaginas(1, 20)  → 1 2 3 4 … 20
 *   ventanaPaginas(10, 20) → 1 … 9 10 11 … 20
 *   ventanaPaginas(20, 20) → 1 … 17 18 19 20
 */
export function ventanaPaginas(actual: number, paginas: number): (number | "…")[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const p = Math.min(Math.max(1, actual), paginas);
  // En los extremos se ensancha, para que el bloque del medio tenga siempre tres.
  const [ini, fin] = p <= 3 ? [2, 4] : p >= paginas - 2 ? [paginas - 3, paginas - 1] : [p - 1, p + 1];
  const lista: (number | "…")[] = [1];
  // Un «…» que tapa un solo número estorba más que el número.
  if (ini === 3) lista.push(2);
  else if (ini > 3) lista.push("…");
  for (let n = ini; n <= fin; n += 1) lista.push(n);
  if (fin === paginas - 2) lista.push(paginas - 1);
  else if (fin < paginas - 2) lista.push("…");
  lista.push(paginas);
  return lista;
}
