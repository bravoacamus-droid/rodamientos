import type { FiltrosRecepciones } from "./tipos";

/**
 * Los filtros de la lista de recepciones, leídos de la URL (19/11).
 *
 * Los leen la pantalla, el Excel y el PDF, y tienen que leer lo mismo: «lo
 * que veo es lo que bajo». Lo que no tiene la forma esperada se ignora en
 * vez de viajar a Postgres.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function leer(p: Params, k: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  const uno = Array.isArray(v) ? v[0] : v;
  const limpio = (uno ?? "").trim();
  return limpio.length > 0 ? limpio : undefined;
}

/** La coma, los paréntesis y los comodines son sintaxis de PostgREST. */
const textoSeguro = (v?: string) =>
  (v ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;

export function leerFiltrosRecepciones(p: Params): Omit<FiltrosRecepciones, "cursor" | "direccion" | "limite"> {
  const id = (k: string) => {
    const v = leer(p, k);
    return v && UUID.test(v) ? v : undefined;
  };
  const fecha = (k: string) => {
    const v = leer(p, k);
    return v && FECHA.test(v) ? v : undefined;
  };
  const moneda = leer(p, "moneda");
  const estado = leer(p, "estado");
  return {
    q: textoSeguro(leer(p, "q")),
    producto: textoSeguro(leer(p, "producto")),
    proveedor: id("proveedor"),
    familia: id("familia"),
    subfamilia: id("subfamilia"),
    marca: id("marca"),
    usuario: id("usuario"),
    moneda: moneda === "USD" || moneda === "PEN" ? moneda : undefined,
    estado: estado === "vigentes" || estado === "anuladas" ? estado : undefined,
    desde: fecha("desde"),
    hasta: fecha("hasta"),
  };
}

export function hayFiltrosRecepciones(f: FiltrosRecepciones): boolean {
  return Boolean(
    f.q || f.producto || f.proveedor || f.familia || f.subfamilia || f.marca || f.usuario || f.moneda || f.estado || f.desde || f.hasta,
  );
}

export function filtrosRecepcionesAQuery(f: FiltrosRecepciones): string {
  const pares: [string, string | undefined][] = [
    ["q", f.q],
    ["producto", f.producto],
    ["proveedor", f.proveedor],
    ["familia", f.familia],
    ["subfamilia", f.subfamilia],
    ["marca", f.marca],
    ["usuario", f.usuario],
    ["moneda", f.moneda],
    ["estado", f.estado],
    ["desde", f.desde],
    ["hasta", f.hasta],
  ];
  return new URLSearchParams(pares.filter((x): x is [string, string] => Boolean(x[1]))).toString();
}

const fechaPeru = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Qué se filtró, en palabras, para la cabecera del Excel y del PDF. */
export function describirFiltrosRecepciones(
  f: FiltrosRecepciones,
  nombres: { proveedor?: string | null; familia?: string | null; subfamilia?: string | null; marca?: string | null; usuario?: string | null },
): string {
  const periodo =
    f.desde && f.hasta
      ? `Del ${fechaPeru(f.desde)} al ${fechaPeru(f.hasta)}`
      : f.desde
        ? `Desde el ${fechaPeru(f.desde)}`
        : f.hasta
          ? `Hasta el ${fechaPeru(f.hasta)}`
          : "Todas las fechas";
  return [
    periodo,
    nombres.proveedor ? `proveedor ${nombres.proveedor}` : null,
    f.producto ? `con el producto «${f.producto}»` : null,
    nombres.familia ? `familia ${nombres.familia}` : null,
    nombres.subfamilia ? `subfamilia ${nombres.subfamilia}` : null,
    nombres.marca ? `marca ${nombres.marca}` : null,
    f.moneda ? (f.moneda === "USD" ? "en dólares" : "en soles") : null,
    f.estado === "anuladas" ? "solo anuladas" : f.estado === "vigentes" ? "sin las anuladas" : null,
    nombres.usuario ? `recibido por ${nombres.usuario}` : null,
    f.q ? `que dicen «${f.q}»` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
