import Link from "next/link";
import { ArrowRight, ChevronRight, FileSpreadsheet, Inbox } from "lucide-react";
import { Button, Skeleton, SkeletonTarjetas, buttonVariants, formatearMoneda } from "@rodatech/ui";

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

/**
 * La clave del `Suspense` de las cifras: cambia con cualquier filtro.
 *
 * Sin ella, al cambiar las fechas o el cliente React se queda con las cifras
 * viejas en pantalla hasta que llegan las nuevas —uno o dos segundos sin
 * ninguna señal—, y parece que el filtro no hizo nada (02/11, Luis: «tarda
 * mucho al cambiar de sección»). Con la clave, salta al esqueleto al momento.
 */
export function claveFiltros(sp: ParamsBusqueda): string {
  return Object.keys(sp)
    .sort()
    .map((k) => `${k}=${uno(sp[k]) ?? ""}`)
    .join("&");
}

/**
 * Lo que se ve mientras llegan las cifras de un reporte: tarjetas, gráfico y
 * ranking, con su forma, para que al llegar no salte nada de sitio. El título
 * y los filtros ya están puestos encima: no esperan a la base.
 */
export function EsqueletoReporte() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Cargando">
      <SkeletonTarjetas cantidad={4} alto={120} />
      <Skeleton className="h-[22rem] w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/**
 * Un bloque del tablero: título, una frase de qué se mira, y su contenido.
 *
 * Rediseño del 27/11 («muy plano»): el título sube a `text-xl` en negrita y
 * lleva delante su icono en chip —o, si la pantalla no le da uno, la barra
 * dorada inclinada del login—, para que cada bloque se reconozca como una
 * pieza y no como un párrafo más. El enlace es un botón con su flecha.
 */
export function Bloque({
  titulo,
  descripcion,
  accion,
  icono,
  children,
  className = "",
}: {
  titulo: string;
  descripcion?: string;
  accion?: { href: string; texto: string };
  /** Un icono de lucide-react, ya con su `aria-hidden`. */
  icono?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card elev-1 flex min-w-0 flex-col gap-4 p-4 sm:p-5 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {icono ? (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--info-bg)] text-[var(--info)] ring-1 ring-inset ring-[var(--border)] [&_svg]:size-6">
              {icono}
            </span>
          ) : (
            <span className="mt-1.5 block h-5 w-2 shrink-0 -skew-x-[20deg] rounded-sm bg-accent-400" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-snug text-[var(--titulo)]">{titulo}</h2>
            {descripcion ? <p className="mt-0.5 text-base text-[var(--fg-muted)]">{descripcion}</p> : null}
          </div>
        </div>
        {accion ? (
          <Link href={accion.href} className={`${buttonVariants({ variant: "outline" })} shrink-0 text-base`}>
            {accion.texto}
            <ArrowRight aria-hidden="true" />
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
 *
 * Rediseño del 27/11 (para «En qué quedó lo cotizado»: que se entienda sin
 * leer la letra pequeña). La barra es gruesa y lleva el porcentaje ESCRITO
 * dentro de cada tramo que tiene sitio; debajo, cada parte es una tarjeta con
 * su filo de color, el nombre, el PORCENTAJE en grande —que es lo que se
 * pregunta: «¿cuánto se ganó?»— y la cifra al lado. La parte con enlace
 * lleva un botón «Ver» con palabra, no una fila que se pulsa sin aspecto de
 * nada.
 */
export function Partes({ partes, vacio }: { partes: Parte[]; vacio?: string }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  if (total <= 0) {
    return <EstadoSinDatos texto={vacio ?? "Nada que repartir."} />;
  }
  const porcentaje = (v: number) => (Math.max(0, v) / total) * 100;
  return (
    <div className="@container flex flex-col gap-4">
      <div
        className="flex h-10 w-full overflow-hidden rounded-xl bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--border)]"
        aria-hidden="true"
      >
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => {
            const v = porcentaje(p.valor);
            return (
              <span
                key={p.clave}
                style={{ width: `${v}%`, background: p.color }}
                className="anim-crecer flex h-full origin-left items-center justify-center overflow-hidden border-r-2 border-[var(--surface)] last:border-r-0"
              >
                {/* El porcentaje dentro del tramo, solo si cabe. Con halo
                    oscuro, porque los colores de las partes son de todo tipo
                    (el amarillo de «sin respuesta», el verde de «se ganó»). */}
                {v >= 12 ? (
                  <span className="tabular px-1 text-base font-extrabold text-white [text-shadow:0_0_3px_rgb(0_0_0/0.75),0_0_1px_rgb(0_0_0/0.9)]">
                    {pct(v)}
                  </span>
                ) : null}
              </span>
            );
          })}
      </div>
      <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {partes.map((p) => (
          <li
            key={p.clave}
            className="flex min-w-0 flex-col gap-1 rounded-xl border border-[var(--border)] border-l-[6px] bg-[var(--surface)] px-4 py-3"
            style={{ borderLeftColor: p.color }}
          >
            <span className="text-base font-semibold leading-snug text-[var(--fg)]">{p.texto}</span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular text-3xl font-extrabold leading-tight text-[var(--titulo)]">
                {pct(porcentaje(p.valor))}
              </span>
              <span className="tabular text-base font-semibold text-[var(--fg-muted)]">
                {p.cifra ?? entero(p.valor)}
              </span>
            </span>
            {p.href ? (
              <Link
                href={p.href}
                aria-label={`Ver: ${p.texto}`}
                className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-1 self-start text-base`}
              >
                Ver
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El estado vacío de un bloque: una frase, con su icono, que no parezca un fallo. */
function EstadoSinDatos({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-8 text-center">
      <Inbox className="size-8 text-[var(--fg-muted)]" aria-hidden="true" />
      <p className="text-base font-medium text-[var(--fg-muted)]">{texto}</p>
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
 * El puesto, en su círculo. El primero en el dorado del logo, el segundo y el
 * tercero en el azul de la marca, y del cuarto en adelante en gris: así se ve
 * de lejos quién encabeza sin leer ningún número.
 */
function Puesto({ n }: { n: number }) {
  const estilo =
    n === 1
      ? "bg-accent-400 text-brand-950 ring-accent-500"
      : n <= 3
        ? "bg-brand-600 text-white ring-brand-700"
        : "bg-[var(--surface-2)] text-[var(--fg-muted)] ring-[var(--border)]";
  return (
    <span
      className={`tabular flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ring-1 ring-inset ${estilo}`}
      aria-label={`Puesto ${n}`}
    >
      {n}
    </span>
  );
}

/**
 * Un ranking con barra: el puesto, el nombre entero arriba, la barra y la
 * cifra debajo.
 *
 * El nombre va en su propia línea porque las razones sociales de los clientes
 * son largas («REACTIVOS NACIONALES S A») y cortadas con «…» dejan de servir.
 *
 * Rediseño del 27/11: el puesto en círculo (1-2-3 destacados), el nombre a
 * `text-lg`, la barra gruesa y la cifra en negrita a la altura del nombre. Los
 * tres primeros llevan la barra entera de color; del cuarto en adelante, más
 * suave, porque el ojo tiene que ir primero arriba.
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
    return <EstadoSinDatos texto={vacio ?? "Sin datos en este periodo."} />;
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {filas.map((f, i) => {
        const puesto = i + 1;
        const contenido = (
          <>
            <Puesto n={puesto} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span
                  className={`min-w-0 text-lg leading-snug ${puesto === 1 ? "font-bold" : "font-semibold"} ${f.href ? "group-hover:underline" : ""}`}
                >
                  {f.nombre}
                </span>
                <span className="tabular shrink-0 text-lg font-bold text-[var(--titulo)]">{f.cifra}</span>
              </div>
              <span className="mt-1.5 block h-4 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden="true">
                <span
                  className="anim-crecer block h-full origin-left rounded-full"
                  style={{
                    width: `${Math.max(2, (f.valor / max) * 100)}%`,
                    background: color,
                    opacity: puesto <= 3 ? 1 : 0.6,
                  }}
                />
              </span>
              {f.detalle ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{f.detalle}</p> : null}
            </div>
            {f.href ? (
              <ChevronRight className="size-6 shrink-0 self-center text-[var(--fg-muted)]" aria-hidden="true" />
            ) : null}
          </>
        );
        return (
          <li key={f.clave}>
            {f.href ? (
              <Link
                href={f.href}
                className="group flex items-start gap-3 rounded-xl border border-transparent px-2 py-2.5 hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
              >
                {contenido}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-2 py-2.5">{contenido}</div>
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
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <span className="text-sm text-[var(--fg-muted)]">{etiqueta}</span>
      <span className={`tabular break-words text-2xl font-extrabold ${color}`}>{valor}</span>
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
  tipo: "ventas" | "cotizaciones" | "compras";
  sp: ParamsBusqueda;
  explicacion: string;
}) {
  // Compras va a su propia ruta (133); las otras dos, a la de siempre.
  const q = new URLSearchParams(tipo === "compras" ? {} : { tipo });
  for (const k of ["atajo", "desde", "hasta", "cliente", "proveedor"]) {
    const v = uno(sp[k]);
    if (v) q.set(k, v);
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-base text-[var(--fg-muted)]">{explicacion}</p>
      {/*
        El botón de siempre, no el verde de Excel en hexadecimal que tenía:
        ese color no estaba en los tokens, no se ajustaba al tema oscuro y hacía
        que la misma acción —bajar un Excel— tuviera dos aspectos. El icono de
        hoja de cálculo es lo que dice que sale un Excel.
      */}
      <Button asChild size="lg" className="shrink-0 text-base [&_svg]:size-5">
        <a
          href={`${tipo === "compras" ? "/reportes/compras/excel" : "/reportes/excel"}?${q.toString()}`}
          download
        >
          <FileSpreadsheet aria-hidden="true" />
          Descargar en Excel
        </a>
      </Button>
    </div>
  );
}
