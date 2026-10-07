import Link from "next/link";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { formatearMoneda } from "@rodatech/ui";

import {
  etiquetaPeriodo,
  leerRango,
  type Grano,
} from "@/modules/reportes";

import {
  emparejar,
  leerComparacion,
  periodosDelRango,
  rangoComparado,
  type ModoComparacion,
} from "../../dominio/ejecutivo";

/**
 * Las piezas que comparten las tres pestañas del tablero ejecutivo.
 *
 * Los rankings y los repartos son HTML, no recharts: una barra horizontal con
 * el nombre y la cifra escritos se lee sin pasar el ratón, sale del servidor
 * ya pintada y no se rompe en el teléfono. Recharts queda para las series en
 * el tiempo, que es donde un eje hace falta.
 */

export type ParamsBusqueda = Record<string, string | string[] | undefined>;

export function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

export function hoyEnLima(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
}

export interface FiltrosEjecutivo {
  rango: { desde: string; hasta: string; grano: Grano };
  atajo: ReturnType<typeof leerRango>["atajo"];
  comparar: ModoComparacion;
  previo: { desde: string; hasta: string };
  /** «Todo» no tiene con qué compararse: no hay nada antes. */
  hayComparacion: boolean;
  periodos: string[];
  periodosPrevios: string[];
}

/**
 * Lee el periodo y la comparación de la URL.
 *
 * Abre en los ÚLTIMOS 12 MESES y no en «este mes» como el Resumen: aquí se
 * viene a ver tendencias —quién compra más que el año pasado, cómo se cierran
 * las cotizaciones— y un mes suelto no tiene tendencia.
 */
export function leerFiltros(sp: ParamsBusqueda, hoy: string): FiltrosEjecutivo {
  const r = leerRango(
    {
      desde: uno(sp.desde),
      hasta: uno(sp.hasta),
      grano: uno(sp.grano),
      atajo: uno(sp.atajo) ?? (uno(sp.desde) ? undefined : "12_meses"),
    },
    hoy,
  );
  const comparar = leerComparacion(uno(sp.comparar));
  const previo = rangoComparado(r, comparar);
  return {
    rango: { desde: r.desde, hasta: r.hasta, grano: r.grano },
    atajo: r.atajo,
    comparar,
    previo,
    hayComparacion: r.atajo !== "todo",
    periodos: periodosDelRango(r.desde, r.hasta, r.grano),
    periodosPrevios: periodosDelRango(previo.desde, previo.hasta, r.grano),
  };
}

/** Serie emparejada lista para `GraficoBarras`, con la etiqueta de cada eje. */
export function serieComparada<T extends { periodo: string }>(
  f: FiltrosEjecutivo,
  actual: readonly T[],
  previo: readonly T[],
  valor: (p: T) => number,
) {
  return emparejar(actual, previo, f.periodos, f.periodosPrevios, valor).map((p) => ({
    etiqueta: etiquetaPeriodo(p.periodo, f.rango.grano),
    etiquetaPrevia: p.periodoPrevio ? etiquetaPeriodo(p.periodoPrevio, f.rango.grano) : null,
    actual: p.actual,
    previo: f.hayComparacion ? p.previo : null,
  }));
}

export const dinero = (n: number) => formatearMoneda(n);

export const entero = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 0 });

export const pct = (n: number | null, decimales = 0) =>
  n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: decimales })} %`;

/** Un bloque del tablero: título, una frase de qué se mira, y su contenido. */
export function Bloque({
  titulo,
  descripcion,
  accion,
  children,
  className = "",
}: {
  titulo: string;
  descripcion?: string;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card elev-1 flex min-w-0 flex-col gap-3 p-4 sm:p-5 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {descripcion ? <p className="text-sm text-[var(--fg-muted)]">{descripcion}</p> : null}
        </div>
        {accion ? (
          <Link
            href={accion.href}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
          >
            {accion.texto}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export interface Parte {
  clave: string;
  texto: string;
  valor: number;
  color: string;
  /** Lo que se escribe a la derecha. Por defecto, el valor como número. */
  cifra?: string;
  href?: string;
}

/**
 * Cómo se reparte un total: una barra entera partida en colores y, debajo,
 * cada parte con su cifra y su porcentaje escritos.
 *
 * En lugar de una dona: el ángulo se lee peor que el largo, y con la lista
 * debajo nadie tiene que adivinar qué color es qué.
 */
export function Partes({ partes, vacio }: { partes: Parte[]; vacio?: string }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  if (total <= 0) {
    return <p className="py-6 text-center text-base text-[var(--fg-muted)]">{vacio ?? "Nada que repartir."}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden="true">
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <span
              key={p.clave}
              style={{ width: `${(p.valor / total) * 100}%`, background: p.color }}
              className="h-full border-r-2 border-[var(--surface)] last:border-r-0"
            />
          ))}
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
        {partes.map((p) => {
          const contenido = (
            <>
              <span className="size-3.5 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-base leading-snug">{p.texto}</span>
              <span className="tabular text-base font-semibold">{p.cifra ?? entero(p.valor)}</span>
              <span className="tabular w-14 text-right text-sm text-[var(--fg-muted)]">
                {pct((Math.max(0, p.valor) / total) * 100)}
              </span>
            </>
          );
          return (
            <li key={p.clave}>
              {p.href ? (
                <Link href={p.href} className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-[var(--surface-2)]">
                  {contenido}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-1 py-2">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface FilaRanking {
  clave: string;
  nombre: string;
  /** Segunda línea, más suave: el código, el número de documentos. */
  detalle?: string;
  valor: number;
  cifra: string;
  href?: string;
}

/**
 * Un ranking con barra: el nombre entero arriba, la barra y la cifra debajo.
 *
 * El nombre va en su propia línea porque las razones sociales de los clientes
 * son largas («REACTIVOS NACIONALES S A») y cortadas con «…» dejan de servir.
 */
export function Ranking({
  filas,
  color = "var(--viz-1)",
  vacio,
}: {
  filas: FilaRanking[];
  color?: string;
  vacio?: string;
}) {
  const max = Math.max(0, ...filas.map((f) => f.valor));
  if (filas.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-base text-[var(--fg-muted)]">{vacio ?? "Sin datos en este periodo."}</p>;
  }
  return (
    <ol className="flex flex-col gap-1">
      {filas.map((f, i) => {
        const contenido = (
          <>
            <div className="flex items-baseline gap-2">
              <span className="tabular w-6 shrink-0 text-sm font-semibold text-[var(--fg-subtle)]">{i + 1}</span>
              <span className="min-w-0 flex-1 text-base font-medium leading-snug">{f.nombre}</span>
            </div>
            <div className="ml-8 mt-1 flex items-center gap-3">
              <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(2, (f.valor / max) * 100)}%`, background: color }}
                />
              </span>
              <span className="tabular shrink-0 text-base font-semibold">{f.cifra}</span>
            </div>
            {f.detalle ? <p className="ml-8 mt-0.5 text-sm text-[var(--fg-muted)]">{f.detalle}</p> : null}
          </>
        );
        return (
          <li key={f.clave}>
            {f.href ? (
              <Link href={f.href} className="block rounded-md px-2 py-2 hover:bg-[var(--surface-2)]">
                {contenido}
              </Link>
            ) : (
              <div className="px-2 py-2">{contenido}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Una cifra pequeña con su nombre, para filas de datos sueltos. */
export function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
  tono?: "ok" | "warn" | "danger";
}) {
  const color =
    tono === "ok" ? "text-[var(--ok)]" : tono === "warn" ? "text-[var(--warn)]" : tono === "danger" ? "text-[var(--danger)]" : "";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
      <span className="text-sm text-[var(--fg-muted)]">{etiqueta}</span>
      <span className={`tabular text-xl font-semibold ${color}`}>{valor}</span>
    </div>
  );
}

/**
 * La descarga del detalle en Excel, con los mismos filtros que la pantalla.
 *
 * Willy, 06/10 (4:51): *«filtro todo lo cotizado y hago un export»*. Un
 * enlace normal a la ruta `/reportes/excel`, con aspecto de botón y una
 * frase que dice QUÉ se va a descargar, antes de pulsarlo.
 */
export function BotonExcel({
  tipo,
  sp,
  explicacion,
}: {
  tipo: "ventas" | "cotizaciones";
  sp: ParamsBusqueda;
  explicacion: string;
}) {
  const q = new URLSearchParams({ tipo });
  for (const k of ["atajo", "desde", "hasta", "cliente"]) {
    const v = uno(sp[k]);
    if (v) q.set(k, v);
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-base text-[var(--fg-muted)]">{explicacion}</p>
      <a
        href={`/reportes/excel?${q.toString()}`}
        download
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#1d6f42] px-4 text-base font-semibold text-white shadow-sm hover:bg-[#185c37]"
      >
        <FileSpreadsheet className="size-5" aria-hidden="true" />
        Descargar en Excel
      </a>
    </div>
  );
}
