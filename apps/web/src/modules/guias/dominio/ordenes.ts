/**
 * Las órdenes de compra del cliente, como lista (14/10).
 *
 * Luis: varias O/C por guía, con chips. Se siguen guardando en la MISMA
 * columna de texto (`orden_compra_cliente`), separadas por «, »: así salen
 * tal cual en el papel de la guía y de la factura, y en el buscador de las
 * listas, sin tocar ni una consulta ni un documento.
 */

/** «OC-345, OC-346» → ["OC-345", "OC-346"], sin vacías ni repetidas. */
export function partirOrdenes(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const crudo of (texto ?? "").split(/[,;\n]/)) {
    const o = crudo.trim().replace(/\s+/g, " ");
    if (!o) continue;
    const clave = o.toUpperCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(o);
  }
  return salida;
}

/** La lista, como se guarda e imprime. */
export function juntarOrdenes(lista: readonly string[]): string {
  return partirOrdenes(lista.join(",")).join(", ");
}

/** Las sugerencias que todavía no están puestas y coinciden con lo tecleado. */
export function sugerenciasPara(
  sugeridas: readonly string[],
  puestas: readonly string[],
  tecleado: string,
): string[] {
  const ya = new Set(puestas.map((p) => p.toUpperCase()));
  const q = tecleado.trim().toUpperCase().replace(/\s+/g, "");
  return sugeridas.filter(
    (s) => !ya.has(s.toUpperCase()) && (!q || s.toUpperCase().replace(/\s+/g, "").includes(q)),
  );
}
