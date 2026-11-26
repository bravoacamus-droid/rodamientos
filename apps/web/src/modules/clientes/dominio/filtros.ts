import type { CondicionPago, FiltrosClientes } from "./tipos";

/**
 * Los filtros de la cartera, leídos de la URL (26/11).
 *
 * Los leen tres sitios —la lista, el Excel y el PDF— y tienen que leer lo
 * mismo: lo que se baja es lo que se ve filtrado. Es entrada hostil (la URL
 * se escribe a mano), así que solo pasan valores con forma conocida.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Lector = (clave: string) => string | undefined;

/** Desde los `searchParams` de una página o desde la URL de una ruta. */
export function lectorDe(
  origen: URLSearchParams | Record<string, string | string[] | undefined>,
): Lector {
  if (origen instanceof URLSearchParams) {
    return (k) => origen.get(k) || undefined;
  }
  return (k) => {
    const v = origen[k];
    const valor = Array.isArray(v) ? v[0] : v;
    return valor && valor.length > 0 ? valor : undefined;
  };
}

/** Lo que filtra (sin la página ni el cursor). */
export function leerFiltrosClientes(leer: Lector): Omit<FiltrosClientes, "cursor" | "direccion" | "limite"> {
  const condicion = leer("condicion");
  const zona = leer("zona");
  const subzona = leer("subzona");
  const rubro = leer("rubro");
  return {
    q: leer("q")?.trim().slice(0, 80) || undefined,
    condicion: condicion === "contado" || condicion === "credito" ? (condicion as CondicionPago) : undefined,
    zona: zona && UUID.test(zona) ? zona : undefined,
    subzona: subzona && UUID.test(subzona) ? subzona : undefined,
    rubro: rubro && UUID.test(rubro) ? rubro : undefined,
    bloqueados: leer("bloqueados") === "1",
    inactivos: leer("inactivos") === "1",
  };
}

/** Los mismos filtros, de vuelta a query string, para los enlaces de descarga. */
export function filtrosClientesAQuery(f: Omit<FiltrosClientes, "cursor" | "direccion" | "limite">): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.condicion) p.set("condicion", f.condicion);
  if (f.zona) p.set("zona", f.zona);
  if (f.subzona) p.set("subzona", f.subzona);
  if (f.rubro) p.set("rubro", f.rubro);
  if (f.bloqueados) p.set("bloqueados", "1");
  if (f.inactivos) p.set("inactivos", "1");
  return p.toString();
}

/** Qué se bajó, en palabras, para la cabecera del Excel y del PDF. */
export function describirFiltrosClientes(
  f: Omit<FiltrosClientes, "cursor" | "direccion" | "limite">,
  nombres: { zona: string | null; subzona?: string | null; rubro: string | null },
): string {
  // La tabla `zonas` es, en pantalla, el DISTRITO (205).
  const partes = [
    nombres.zona ? `Distrito ${nombres.zona}` : "Todos los distritos",
    nombres.subzona ? `zona ${nombres.subzona}` : null,
    nombres.rubro ? `rubro ${nombres.rubro}` : null,
    f.condicion === "credito" ? "a crédito" : f.condicion === "contado" ? "al contado" : null,
    f.q ? `que dicen «${f.q}»` : null,
    f.inactivos ? "incluye desactivados" : null,
    f.bloqueados ? "incluye bloqueados" : null,
  ].filter(Boolean);
  return partes.join(" · ");
}
