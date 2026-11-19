import { ETIQUETA_MOVIMIENTO, type FiltrosKardex, type TipoMovimiento } from "./tipos";

/**
 * Los filtros del kardex, leídos de la URL (19/11).
 *
 * Los leen TRES sitios —la pantalla, el Excel y el PDF— y tienen que leer lo
 * mismo: «lo que veo es lo que bajo». Por eso están aquí, puros, y no
 * copiados en cada ruta.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Los orígenes que existen en `movimientos_inventario.referencia_tipo`. */
export const ORIGENES_KARDEX = [
  { valor: "recepcion", etiqueta: "Recepción de compra" },
  { valor: "guia", etiqueta: "Guía de remisión" },
  { valor: "comprobante", etiqueta: "Factura" },
  { valor: "ajuste", etiqueta: "Ajuste de inventario" },
  { valor: "compra", etiqueta: "Compra" },
  { valor: "importacion", etiqueta: "Carga inicial" },
] as const;

export function etiquetaOrigen(v: string | null | undefined): string {
  return ORIGENES_KARDEX.find((o) => o.valor === v)?.etiqueta ?? (v ?? "");
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function leer(p: Params, k: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  const uno = Array.isArray(v) ? v[0] : v;
  const limpio = (uno ?? "").trim();
  return limpio.length > 0 ? limpio : undefined;
}

/**
 * De la URL a los filtros, ya limpios: un id que no es uuid, un tipo que no
 * existe o una fecha mal escrita se IGNORAN, en vez de viajar a Postgres para
 * que los rechace con un error que no se le puede enseñar a nadie.
 */
export function leerFiltrosKardex(p: Params): Omit<FiltrosKardex, "cursor" | "direccion" | "limite"> {
  const id = (k: string) => {
    const v = leer(p, k);
    return v && UUID.test(v) ? v : undefined;
  };
  const fecha = (k: string) => {
    const v = leer(p, k);
    return v && FECHA.test(v) ? v : undefined;
  };
  const tipo = leer(p, "tipo");
  const referencia = leer(p, "referencia");
  // La coma, los paréntesis y los comodines son sintaxis de PostgREST.
  const q = (leer(p, "q") ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    producto: id("producto"),
    familia: id("familia"),
    subfamilia: id("subfamilia"),
    marca: id("marca"),
    usuario: id("usuario"),
    tipo: tipo && Object.hasOwn(ETIQUETA_MOVIMIENTO, tipo) ? (tipo as TipoMovimiento) : undefined,
    referencia: referencia && ORIGENES_KARDEX.some((o) => o.valor === referencia) ? referencia : undefined,
    q: q || undefined,
    desde: fecha("desde"),
    hasta: fecha("hasta"),
  };
}

/** ¿Hay algún filtro puesto, aparte de la paginación? */
export function hayFiltros(f: FiltrosKardex): boolean {
  return Boolean(
    f.producto || f.familia || f.subfamilia || f.marca || f.usuario || f.tipo || f.referencia || f.q || f.desde || f.hasta,
  );
}

/**
 * Los extremos del periodo, en HORA DE LIMA.
 *
 * `fecha` es un instante. «Desde el 01/11» es la medianoche de Lima (las
 * 05:00 UTC), no la de Greenwich: con la de Greenwich, lo movido el 31/10 a
 * las 8 de la noche entraba en noviembre.
 */
export function rangoLima(desde?: string, hasta?: string): { desde?: string; hasta?: string } {
  return {
    desde: desde ? `${desde}T00:00:00-05:00` : undefined,
    hasta: hasta ? `${hasta}T23:59:59.999-05:00` : undefined,
  };
}

/** Los filtros de nuevo como query string, para los enlaces de Excel y PDF. */
export function filtrosAQuery(f: FiltrosKardex): string {
  const pares: [string, string | undefined][] = [
    ["producto", f.producto],
    ["familia", f.familia],
    ["subfamilia", f.subfamilia],
    ["marca", f.marca],
    ["usuario", f.usuario],
    ["tipo", f.tipo],
    ["referencia", f.referencia],
    ["q", f.q],
    ["desde", f.desde],
    ["hasta", f.hasta],
  ];
  return new URLSearchParams(pares.filter((p): p is [string, string] => Boolean(p[1]))).toString();
}

/** «25/09/2026», como se escribe en Perú. */
export function fechaPeru(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Qué se filtró, en palabras, para la cabecera del Excel y del PDF: quien
 * lea el papel dentro de un mes tiene que saber qué está mirando.
 */
export function describirFiltros(
  f: FiltrosKardex,
  nombres: { producto?: string | null; familia?: string | null; subfamilia?: string | null; marca?: string | null; usuario?: string | null },
): string {
  const periodo =
    f.desde && f.hasta
      ? `Del ${fechaPeru(f.desde)} al ${fechaPeru(f.hasta)}`
      : f.desde
        ? `Desde el ${fechaPeru(f.desde)}`
        : f.hasta
          ? `Hasta el ${fechaPeru(f.hasta)}`
          : "Todo el historial";
  const partes = [
    periodo,
    nombres.producto ? `producto ${nombres.producto}` : null,
    nombres.familia ? `familia ${nombres.familia}` : null,
    nombres.subfamilia ? `subfamilia ${nombres.subfamilia}` : null,
    nombres.marca ? `marca ${nombres.marca}` : null,
    f.tipo ? ETIQUETA_MOVIMIENTO[f.tipo as TipoMovimiento] : null,
    f.referencia ? `origen ${etiquetaOrigen(f.referencia)}` : null,
    nombres.usuario ? `hecho por ${nombres.usuario}` : null,
    f.q ? `que dicen «${f.q}»` : null,
  ];
  return partes.filter(Boolean).join(" · ");
}
