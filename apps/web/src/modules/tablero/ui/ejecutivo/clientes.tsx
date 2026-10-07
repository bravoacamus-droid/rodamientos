import Link from "next/link";
import { PhoneCall, PieChart, UserMinus, UserPlus, Users } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";

import { FiltroRango, etiquetaPeriodo } from "@/modules/reportes";

import { datosClientes } from "../../api/ejecutivo";
import {
  ETIQUETA_SEGMENTO,
  EXPLICA_SEGMENTO,
  FRASE_COMPARACION,
  ORDEN_SEGMENTOS,
  concentracion,
  resumirSegmentos,
  segmentoDe,
  type Segmento,
} from "../../dominio/ejecutivo";
import { FiltroComparar } from "./filtros";
import { GraficoBarras } from "./grafico-lazy";
import {
  Bloque,
  Ranking,
  dinero,
  entero,
  hoyEnLima,
  leerFiltros,
  pct,
  uno,
  type ParamsBusqueda,
} from "./piezas";

/**
 * Tablero · Clientes.
 *
 * Luis, 06/10, por Willy: *«reporte de clientes, gestión total de cómo van,
 * qué compran más, con gráficos, comparación de sus meses pasados»*.
 *
 * La pregunta de fondo no es «cuánto vendí» —eso ya lo dice Facturación—
 * sino **quién**: quién compra más que antes, quién compra menos, quién es
 * nuevo y, sobre todo, quién dejó de venir. Ese último grupo es una lista de
 * llamadas, y por eso sale con nombre y fecha, no solo como un número.
 */

const COLOR_SEGMENTO: Record<Segmento, string> = {
  nuevo: "var(--viz-4)",
  crece: "var(--viz-3)",
  estable: "var(--viz-1)",
  baja: "var(--viz-2)",
  perdido: "var(--viz-5)",
};

function enlace(sp: ParamsBusqueda, cambios: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const x = uno(v);
    if (x) q.set(k, x);
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `/reportes/clientes?${s}` : "/reportes/clientes";
}

/** El periodo y la comparación, para ir a la facturación de un cliente. */
function aFacturacion(sp: ParamsBusqueda, cliente: string) {
  const q = new URLSearchParams();
  for (const k of ["atajo", "desde", "hasta", "grano", "comparar"]) {
    const v = uno(sp[k]);
    if (v) q.set(k, v);
  }
  q.set("cliente", cliente);
  return `/reportes/facturacion?${q.toString()}`;
}

export default async function PaginaClientesEjecutiva({
  searchParams,
}: {
  searchParams: Promise<ParamsBusqueda>;
}) {
  const sp = await searchParams;
  const hoy = hoyEnLima();
  const f = leerFiltros(sp, hoy);
  const frase = FRASE_COMPARACION[f.comparar];
  const grupo = ORDEN_SEGMENTOS.find((s) => s === uno(sp.grupo)) ?? null;

  const filtro = (
    <FiltroRango
      desde={f.rango.desde}
      hasta={f.rango.hasta}
      grano={f.rango.grano}
      atajo={f.atajo}
      extra={<FiltroComparar valor={f.comparar} />}
    />
  );

  const res = await datosClientes(f.rango, f.previo);
  if (!res.ok) {
    return (
      <>
        {filtro}
        <EstadoError titulo="No se pudieron cargar los clientes" detalle={res.error} />
      </>
    );
  }

  const d = res.datos;
  const { desde, hasta } = f.rango;
  const filas = d.clientes;
  const conSegmento = filas.map((x) => ({ ...x, segmento: segmentoDe(x, desde, hasta) }));
  const segmentos = resumirSegmentos(filas, desde, hasta);
  const cuenta = (s: Segmento) => segmentos.find((x) => x.segmento === s)?.clientes ?? 0;

  const activos = filas.filter((x) => x.venta > 0).length;
  const activosPrev = filas.filter((x) => x.ventaPrev > 0).length;
  const venta = filas.reduce((s, x) => s + x.venta, 0);
  const top5 = concentracion(filas, 5);
  const perdidos = conSegmento
    .filter((x) => x.segmento === "perdido")
    .sort((a, b) => b.ventaPrev - a.ventaPrev);

  // Los 12 primeros, y el resto a un toque: con 35 tarjetas el teléfono
  // pasaba de 14.000 px de alto y lo de abajo no lo veía nadie.
  const verTodos = uno(sp.ver) === "todos";
  const tabla = (grupo ? conSegmento.filter((x) => x.segmento === grupo) : conSegmento).sort(
    (a, b) => b.venta - a.venta || b.ventaPrev - a.ventaPrev,
  );

  const visibles = verTodos ? tabla : tabla.slice(0, 12);

  // Por periodo: los de siempre abajo y los nuevos encima, que suman los activos.
  const porPeriodo = new Map(d.serie.map((p) => [p.periodo.slice(0, 10), p]));
  const serieEtiquetada = f.periodos.map((periodo) => {
    const p = porPeriodo.get(periodo);
    return {
      etiqueta: etiquetaPeriodo(periodo, f.rango.grano),
      deSiempre: p ? p.activos - p.nuevos : 0,
      nuevos: p ? p.nuevos : 0,
    };
  });

  return (
    <div className="@container flex flex-col gap-5">
      {filtro}

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Clientes que compraron"
          icono={<Users aria-hidden="true" />}
          valor={entero(activos)}
          detalle={`de ${entero(d.catalogo)} en el catálogo · ${entero(d.nunca)} nunca han comprado`}
          actual={activos}
          previo={f.hayComparacion ? activosPrev : undefined}
          etiquetaComparacion={frase}
        />
        <KpiCard
          etiqueta="Clientes nuevos"
          icono={<UserPlus aria-hidden="true" />}
          valor={entero(cuenta("nuevo"))}
          detalle="primera compra de su historia en este periodo"
          href={enlace(sp, { grupo: "nuevo" })}
        />
        <KpiCard
          etiqueta="Dejaron de comprar"
          icono={<UserMinus aria-hidden="true" />}
          valor={entero(cuenta("perdido"))}
          detalle={
            f.hayComparacion
              ? `compraban ${dinero(segmentos.find((s) => s.segmento === "perdido")?.ventaPrev ?? 0)} y este periodo nada`
              : "elige un periodo para comparar"
          }
          href={enlace(sp, { grupo: "perdido" })}
        />
        <KpiCard
          etiqueta="Los 5 primeros se llevan"
          icono={<PieChart aria-hidden="true" />}
          valor={pct(top5)}
          detalle={
            top5 === null
              ? "sin ventas en el periodo"
              : top5 >= 60
                ? "de la venta: mucho depende de pocos clientes"
                : "de la venta del periodo"
          }
        />
      </div>

      <Bloque
        titulo="Cómo se movió la cartera"
        descripcion={`Cada cliente que compró en este periodo o en la comparación, en un grupo. Toca uno para verlos en la tabla.`}
      >
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @5xl:grid-cols-5">
          {segmentos.map((s) => {
            const activo = grupo === s.segmento;
            return (
              <Link
                key={s.segmento}
                href={enlace(sp, { grupo: activo ? null : s.segmento })}
                aria-pressed={activo}
                className={`flex flex-col gap-1 rounded-lg border-2 p-3 transition-colors ${
                  activo
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                    : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <span className="size-3.5 shrink-0 rounded-[3px]" style={{ background: COLOR_SEGMENTO[s.segmento] }} aria-hidden="true" />
                  {ETIQUETA_SEGMENTO[s.segmento]}
                </span>
                <span className="tabular text-2xl font-semibold">{entero(s.clientes)}</span>
                <span className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
                  <span className="text-[var(--fg-muted)]">Ahora</span>
                  <span className="tabular text-right font-semibold">{dinero(s.venta)}</span>
                  <span className="text-[var(--fg-muted)]">Antes</span>
                  <span className="tabular text-right">{dinero(s.ventaPrev)}</span>
                </span>
                <span className="text-sm text-[var(--fg-muted)]">{EXPLICA_SEGMENTO[s.segmento]}</span>
              </Link>
            );
          })}
        </div>
      </Bloque>

      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-5">
        <Bloque
          className="@5xl:col-span-3"
          titulo="Clientes que compraron, por periodo"
          descripcion="Abajo los que ya compraban; encima, los que compraron por primera vez."
        >
          {activos === 0 ? (
            <p className="py-10 text-center text-base text-[var(--fg-muted)]">Nadie compró en este periodo.</p>
          ) : (
            <GraficoBarras
              formato="numero"
              datos={serieEtiquetada}
              series={[
                { clave: "deSiempre", nombre: "Ya eran clientes", color: "var(--viz-1)", apilado: true },
                { clave: "nuevos", nombre: "Nuevos", color: "var(--viz-4)", apilado: true },
              ]}
            />
          )}
        </Bloque>

        <Bloque
          className="@5xl:col-span-2"
          titulo="A quién llamar"
          descripcion="Compraban en la comparación y este periodo no. Los que más compraban, primero."
        >
          {perdidos.length === 0 ? (
            <p className="py-8 text-center text-base text-[var(--fg-muted)]">
              {f.hayComparacion ? "Ninguno: todos los de antes siguen comprando." : "Elige un periodo para comparar."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {perdidos.slice(0, 6).map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <PhoneCall className="size-5 shrink-0 text-[var(--viz-5)]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/clientes/${x.id}`} className="block text-base font-semibold leading-snug hover:underline">
                      {x.cliente}
                    </Link>
                    <p className="text-sm text-[var(--fg-muted)]">
                      Última compra el {formatearFecha(x.ultima)} · hace {entero(x.diasSinComprar)} días
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-base font-semibold">{dinero(x.ventaPrev)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Quién compra más" descripcion="Los diez primeros del periodo. Toca uno para ver su facturación mes a mes.">
        <Ranking
          filas={conSegmento
            .filter((x) => x.venta > 0)
            .slice(0, 10)
            .map((x) => ({
              clave: x.id,
              nombre: x.cliente,
              detalle: `${pct(venta > 0 ? (x.venta / venta) * 100 : 0)} del total · ${entero(x.documentos)} ${x.documentos === 1 ? "compra" : "compras"}${
                f.hayComparacion ? ` · antes ${dinero(x.ventaPrev)}` : ""
              }`,
              valor: x.venta,
              cifra: dinero(x.venta),
              href: aFacturacion(sp, x.id),
            }))}
          vacio="Nadie compró en este periodo."
        />
      </Bloque>

      <Bloque
        titulo={grupo ? `Clientes · ${ETIQUETA_SEGMENTO[grupo]}` : "Todos los clientes del periodo"}
        descripcion={`${entero(tabla.length)} ${tabla.length === 1 ? "cliente" : "clientes"}. Cada uno con lo de este periodo, lo de la comparación y cuándo compró por última vez.`}
        accion={grupo ? { href: enlace(sp, { grupo: null }), texto: "Ver todos" } : undefined}
      >
        {tabla.length === 0 ? (
          <p className="py-8 text-center text-base text-[var(--fg-muted)]">Ningún cliente en este grupo.</p>
        ) : (
          <>
            {/* Escritorio: tabla. */}
            <div className="scroll-x hidden @3xl:block">
              <table className="w-full text-base">
                <thead className="border-b border-[var(--border)] text-left text-sm text-[var(--fg-muted)]">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Cliente</th>
                    <th className="px-3 py-2 text-right font-semibold">Este periodo</th>
                    {f.hayComparacion ? <th className="px-3 py-2 text-right font-semibold">Comparación</th> : null}
                    {f.hayComparacion ? <th className="px-3 py-2 text-right font-semibold">Cambio</th> : null}
                    <th className="px-3 py-2 text-right font-semibold">Compras</th>
                    <th className="px-3 py-2 font-semibold">Última compra</th>
                    <th className="py-2 pl-3 text-right font-semibold">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {visibles.map((x) => {
                    const cambio = x.ventaPrev > 0 ? ((x.venta - x.ventaPrev) / x.ventaPrev) * 100 : null;
                    return (
                      <tr key={x.id} className="align-top">
                        <td className="py-2.5 pr-3">
                          <span className="flex items-start gap-2">
                            <span
                              className="mt-1.5 size-3 shrink-0 rounded-[3px]"
                              style={{ background: COLOR_SEGMENTO[x.segmento] }}
                              title={ETIQUETA_SEGMENTO[x.segmento]}
                              aria-hidden="true"
                            />
                            <span>
                              <span className="font-medium">{x.cliente}</span>
                              <span className="block text-sm text-[var(--fg-muted)]">{ETIQUETA_SEGMENTO[x.segmento]}</span>
                            </span>
                          </span>
                        </td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold">{dinero(x.venta)}</td>
                        {f.hayComparacion ? (
                          <td className="tabular px-3 py-2.5 text-right text-[var(--fg-muted)]">{dinero(x.ventaPrev)}</td>
                        ) : null}
                        {f.hayComparacion ? (
                          <td
                            className={`tabular px-3 py-2.5 text-right font-semibold ${
                              cambio === null ? "text-[var(--fg-muted)]" : cambio >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {cambio === null ? (x.segmento === "nuevo" ? "nuevo" : "volvió") : `${cambio > 0 ? "+" : ""}${pct(cambio)}`}
                          </td>
                        ) : null}
                        <td className="tabular px-3 py-2.5 text-right">{entero(x.documentos)}</td>
                        <td className="px-3 py-2.5">
                          <span className="tabular">{formatearFecha(x.ultima)}</span>
                          <span className="block text-sm text-[var(--fg-muted)]">hace {entero(x.diasSinComprar)} días</span>
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <Link
                            href={aFacturacion(sp, x.id)}
                            className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] px-3 text-sm font-semibold whitespace-nowrap hover:bg-[var(--surface-2)]"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Teléfono y tablet: una tarjeta por cliente. */}
            <ul className="flex flex-col gap-2 @3xl:hidden">
              {visibles.map((x) => {
                const cambio = x.ventaPrev > 0 ? ((x.venta - x.ventaPrev) / x.ventaPrev) * 100 : null;
                return (
                  <li key={x.id} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="flex items-start gap-2 text-base font-semibold leading-snug">
                      <span className="mt-1.5 size-3 shrink-0 rounded-[3px]" style={{ background: COLOR_SEGMENTO[x.segmento] }} aria-hidden="true" />
                      {x.cliente}
                    </p>
                    <p className="ml-5 text-sm text-[var(--fg-muted)]">{ETIQUETA_SEGMENTO[x.segmento]}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[var(--fg-muted)]">Este periodo</dt>
                      <dd className="tabular text-right text-base font-semibold">{dinero(x.venta)}</dd>
                      {f.hayComparacion ? (
                        <>
                          <dt className="text-[var(--fg-muted)]">Comparación</dt>
                          <dd className="tabular text-right">{dinero(x.ventaPrev)}</dd>
                          <dt className="text-[var(--fg-muted)]">Cambio</dt>
                          <dd
                            className={`tabular text-right font-semibold ${
                              cambio === null ? "" : cambio >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {cambio === null ? (x.segmento === "nuevo" ? "nuevo" : "volvió") : `${cambio > 0 ? "+" : ""}${pct(cambio)}`}
                          </dd>
                        </>
                      ) : null}
                      <dt className="text-[var(--fg-muted)]">Última compra</dt>
                      <dd className="tabular text-right">{formatearFecha(x.ultima)}</dd>
                    </dl>
                    <Link
                      href={aFacturacion(sp, x.id)}
                      className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--border-strong)] text-sm font-semibold hover:bg-[var(--surface-2)]"
                    >
                      Ver detalle
                    </Link>
                  </li>
                );
              })}
            </ul>

            {tabla.length > visibles.length ? (
              <Link
                href={enlace(sp, { ver: "todos" })}
                scroll={false}
                className="inline-flex h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold hover:bg-[var(--surface-2)]"
              >
                Ver los {entero(tabla.length)} clientes
              </Link>
            ) : null}
          </>
        )}
      </Bloque>
    </div>
  );
}
