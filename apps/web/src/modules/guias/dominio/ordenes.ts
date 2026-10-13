/**
 * La orden de compra del cliente en la guía (14/10).
 *
 * UNA por guía. Luis lo corrigió el mismo día: *«solo puede tener un número
 * de orden de compra de cliente, no puede tener varios; pero sí un número de
 * orden de cliente puede estar en varias guías»*. Por eso lo útil es SUGERIR
 * las que ya usó ese cliente: la segunda guía de un pedido lleva la misma O/C
 * que la primera, y así no se teclea dos veces (ni se teclea distinto).
 */

const normal = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

/** Las ya usadas, sin repetir, en el orden en que llegan (las recientes primero). */
export function distintas(lista: readonly (string | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const crudo of lista) {
    const o = (crudo ?? "").trim().replace(/\s+/g, " ");
    if (!o || vistas.has(normal(o))) continue;
    vistas.add(normal(o));
    salida.push(o);
  }
  return salida;
}

/** Las que conviene ofrecer: no la que ya está puesta, y que coincidan con lo tecleado. */
export function sugerenciasPara(usadas: readonly string[], actual: string): string[] {
  const q = normal(actual);
  return usadas.filter((u) => normal(u) !== q && (!q || normal(u).includes(q)));
}
