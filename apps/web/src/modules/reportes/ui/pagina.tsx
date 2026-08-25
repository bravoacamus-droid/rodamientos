import { Suspense } from "react";
import Link from "next/link";
import { CifraAnimada, EstadoError, EstadoVacio, Skeleton } from "@rodatech/ui";

import {
  agingCartera,
  embudoComercial,
  resumen,
  topProductos,
  valorizacionPorFamilia,
  ventasMensuales,
} from "../api/consultas";
import { etiquetaAging, variacionPct } from "../dominio/periodo";
import {
  GraficoAging,
  GraficoTopProductos,
  GraficoValorizacion,
  GraficoVentas,
} from "./graficos";

/**
 * Informes.
 *
 * Cada bloque va en su propio `<Suspense>`: son cinco consultas independientes
 * y encadenarlas haría esperar el gráfico rápido por el lento. Así el tablero
 * se va rellenando en vez de aparecer de golpe al final.
 *
 * La fecha se calcula en el servidor con la zona de Lima. Sin fijarla, un
 * informe abierto a las 7 de la tarde contaría el mes siguiente.
 */
export default async function PaginaReportes() {
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cómo va el negocio: qué se vende, qué margen deja, qué falta por cobrar y
          cuánto capital hay parado en el almacén.
        </p>
      </div>

      <Suspense fallback={<FilaSkeleton alto="h-24" columnas={4} />}>
        <Indicadores hoy={hoy} />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Bloque
          titulo="Ventas por mes"
          nota="El área es lo vendido sin IGV; la línea, lo que queda después del costo."
        >
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <BloqueVentas hoy={hoy} />
          </Suspense>
        </Bloque>

        <Bloque
          titulo="Capital en el almacén"
          nota="A costo, por familia. Lo que está aquí no está en la cuenta."
        >
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <BloqueValorizacion />
          </Suspense>
        </Bloque>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Bloque
          titulo="Lo que más se vende"
          nota="El color es el margen: verde por encima del 20 %, ámbar por debajo del 10 %."
        >
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <BloqueTop />
          </Suspense>
        </Bloque>

        <Bloque
          titulo="Cobranzas"
          nota="Cuánto se debe y desde cuándo. De izquierda a derecha, de menos a más urgente."
        >
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <BloqueAging />
          </Suspense>
        </Bloque>
      </div>

      <Bloque
        titulo="Del presupuesto al cobro"
        nota="Dónde se queda el dinero por el camino."
      >
        <Suspense fallback={<Skeleton className="h-32 w-full" />}>
          <BloqueEmbudo />
        </Suspense>
      </Bloque>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Bloque({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-entrada card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {/* La nota explica CÓMO leer el gráfico. Un gráfico sin instrucciones
            se mira una vez y no se vuelve a abrir. */}
        {nota ? (
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{nota}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FilaSkeleton({ alto, columnas }: { alto: string; columnas: number }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-${columnas}`}>
      {Array.from({ length: columnas }, (_, i) => (
        <Skeleton key={i} className={`${alto} w-full`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

async function Indicadores({ hoy }: { hoy: string }) {
  const r = await resumen(hoy);
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los indicadores" detalle={r.error} />;
  }

  const d = r.datos;
  const variacion = variacionPct(d.ventaMes, d.ventaMesAnterior);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        etiqueta="Vendido este mes"
        valor={d.ventaMes}
        prefijo="$ "
        decimales={2}
        pie={
          variacion === null
            ? "sin mes anterior con el que comparar"
            : `${variacion > 0 ? "+" : ""}${variacion} % frente al mes pasado`
        }
        tono={variacion === null ? undefined : variacion >= 0 ? "ok" : "malo"}
      />
      <Kpi
        etiqueta="Margen del mes"
        valor={d.margenPct}
        sufijo=" %"
        decimales={1}
        pie="sobre la venta"
        tono={d.margenPct >= 15 ? "ok" : d.margenPct > 0 ? "aviso" : undefined}
      />
      <Kpi
        etiqueta="Por cobrar"
        valor={d.porCobrar}
        prefijo="$ "
        decimales={2}
        pie={d.vencido > 0 ? `$ ${d.vencido.toFixed(2)} ya vencido` : "nada vencido"}
        tono={d.vencido > 0 ? "malo" : "ok"}
      />
      <Kpi
        etiqueta="Capital en almacén"
        valor={d.inventarioCosto}
        prefijo="$ "
        decimales={2}
        pie={
          d.skusBajoMinimo > 0
            ? `${d.skusBajoMinimo} ${d.skusBajoMinimo === 1 ? "producto" : "productos"} bajo mínimo`
            : "nada bajo mínimo"
        }
        tono={d.skusBajoMinimo > 0 ? "aviso" : undefined}
      />
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  prefijo = "",
  sufijo = "",
  decimales = 0,
  pie,
  tono,
}: {
  etiqueta: string;
  valor: number;
  prefijo?: string;
  sufijo?: string;
  decimales?: number;
  pie?: string;
  tono?: "ok" | "aviso" | "malo";
}) {
  const color =
    tono === "malo"
      ? "text-[var(--danger)]"
      : tono === "aviso"
        ? "text-[var(--warn)]"
        : tono === "ok"
          ? "text-[var(--ok)]"
          : "";
  return (
    <div className="card anim-entrada p-3">
      <p className="text-xs text-[var(--fg-muted)]">{etiqueta}</p>
      <p className="mt-0.5 text-xl font-semibold">
        <CifraAnimada
          valor={valor}
          decimales={decimales}
          prefijo={prefijo}
          sufijo={sufijo}
        />
      </p>
      {pie ? <p className={`mt-0.5 text-xs ${color || "text-[var(--fg-subtle)]"}`}>{pie}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

async function BloqueVentas({ hoy }: { hoy: string }) {
  const r = await ventasMensuales(hoy, 12);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la serie" detalle={r.error} />;

  const conVentas = r.datos.some((m) => m.ventaNeta > 0);
  if (!conVentas) {
    return (
      <EstadoVacio
        titulo="Todavía no hay ventas"
        descripcion="En cuanto se emita el primer comprobante, la serie empieza a dibujarse."
      />
    );
  }

  return <GraficoVentas datos={r.datos} />;
}

async function BloqueTop() {
  const r = await topProductos(10);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el ranking" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin productos vendidos"
        descripcion="El ranking se llena solo conforme se factura."
      />
    );
  }

  return (
    <>
      <GraficoTopProductos datos={r.datos} />
      <div className="scroll-x mt-3 border-t border-[var(--border-soft)] pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-[var(--fg-subtle)]">
              <th className="py-1.5 pr-3 font-medium">Código</th>
              <th className="py-1.5 pr-3 font-medium">Descripción</th>
              <th className="py-1.5 pr-3 text-right font-medium">Uds.</th>
              <th className="py-1.5 pr-3 text-right font-medium">Vendido</th>
              <th className="py-1.5 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody>
            {r.datos.map((p, i) => (
              <tr
                key={p.id}
                className="anim-entrada border-t border-[var(--border-soft)]"
                style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
              >
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/productos/${p.id}`}
                    className="font-mono font-medium text-brand-600 hover:underline"
                  >
                    {p.codigo}
                  </Link>
                </td>
                <td className="max-w-xs py-1.5 pr-3">
                  <span className="block truncate">{p.descripcion}</span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular">{p.unidades}</td>
                <td className="py-1.5 pr-3 text-right tabular">{p.venta.toFixed(2)}</td>
                <td
                  className={`py-1.5 text-right tabular font-medium ${
                    p.margenPct >= 20
                      ? "text-[var(--ok)]"
                      : p.margenPct < 10
                        ? "text-[var(--warn)]"
                        : ""
                  }`}
                >
                  {p.margenPct} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function BloqueAging() {
  const r = await agingCartera();
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la cartera" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada por cobrar"
        descripcion="Todo lo facturado está cobrado."
      />
    );
  }

  const total = r.datos.reduce((a, t) => a + t.saldo, 0);

  return (
    <>
      <GraficoAging datos={r.datos} />
      <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-3 text-xs">
        {r.datos.map((t) => (
          <li key={t.tramo} className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--fg-muted)]">
              {etiquetaAging(t.tramo)}
              <span className="ml-1.5 text-[var(--fg-subtle)]">
                ({t.documentos} {t.documentos === 1 ? "doc." : "docs."})
              </span>
            </span>
            <span className="tabular font-medium">$ {t.saldo.toFixed(2)}</span>
          </li>
        ))}
        <li className="mt-1 flex items-baseline justify-between gap-2 border-t border-[var(--border-soft)] pt-1.5">
          <span className="font-medium">Total</span>
          <span className="tabular font-semibold">$ {total.toFixed(2)}</span>
        </li>
      </ul>
    </>
  );
}

async function BloqueValorizacion() {
  const r = await valorizacionPorFamilia();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo cargar la valorización" detalle={r.error} />;
  }

  if (r.datos.length === 0) {
    return (
      <EstadoVacio
        titulo="El almacén está vacío"
        descripcion="Cuando entre mercadería con una recepción, aparecerá aquí."
      />
    );
  }

  return (
    <>
      <GraficoValorizacion datos={r.datos} />
      <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--border-soft)] pt-3 text-xs">
        {r.datos.map((f) => (
          <li key={f.familia} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[var(--fg-muted)]">
              {f.familia}
              <span className="ml-1.5 text-[var(--fg-subtle)]">({f.skus} SKU)</span>
            </span>
            <span className="tabular font-medium">$ {f.valorCosto.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

async function BloqueEmbudo() {
  const r = await embudoComercial();
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el embudo" detalle={r.error} />;

  const e = r.datos;
  if (e.cotizado === 0) {
    return (
      <EstadoVacio
        titulo="Sin cotizaciones todavía"
        descripcion="El embudo se dibuja a partir de la primera cotización."
      />
    );
  }

  /** «1 cotización», no «1 cotizaciones». */
  const plural = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`;

  const pasos = [
    {
      nombre: "Cotizado",
      valor: e.cotizado,
      pie: plural(e.cotizaciones, "cotización", "cotizaciones"),
    },
    {
      nombre: "Despachado",
      valor: e.despachado,
      pie: e.guias > 0 ? plural(e.guias, "guía", "guías") : "sin guías todavía",
    },
    {
      nombre: "Facturado",
      valor: e.facturado,
      pie: plural(e.comprobantes, "comprobante", "comprobantes"),
    },
    { nombre: "Cobrado", valor: e.cobrado, pie: "" },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {pasos.map((p, i) => {
        // El ancho es relativo al primer paso, que es el 100 %. Así se ve de un
        // vistazo cuánto se cae por el camino.
        const pct = e.cotizado > 0 ? (p.valor / e.cotizado) * 100 : 0;
        // Por debajo del 18 % la cifra no cabe dentro de la barra y sale
        // recortada. A partir de ahí se escribe fuera, en color normal.
        const dentro = pct >= 18;

        return (
          <div key={p.nombre} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-[var(--fg-muted)]">{p.nombre}</span>

            <div className="flex h-7 flex-1 items-center gap-2">
              <div
                className="h-full overflow-hidden rounded-sm bg-[var(--surface-2)]"
                style={{ width: dentro ? `${pct}%` : undefined, flex: dentro ? "none" : 1 }}
              >
                <div
                  className="anim-crecer flex h-full items-center justify-end rounded-sm pr-2"
                  style={{
                    // Un mínimo visible para que un paso en cero se vea como
                    // «no pasó nada» y no como «no existe este paso».
                    width: dentro ? "100%" : `${Math.max(1.5, pct)}%`,
                    animationDelay: `${i * 90}ms`,
                    background:
                      i === 3
                        ? "var(--ok)"
                        : `color-mix(in srgb, var(--color-brand-600) ${100 - i * 18}%, var(--color-brand-300))`,
                  }}
                >
                  {dentro ? (
                    <span className="tabular text-[0.7rem] font-medium text-white">
                      $ {p.valor.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>

              {!dentro ? (
                <span className="tabular shrink-0 text-[0.7rem] font-medium text-[var(--fg-muted)]">
                  $ {p.valor.toFixed(2)}
                </span>
              ) : null}
            </div>

            <span className="w-32 shrink-0 text-right text-[0.7rem] text-[var(--fg-subtle)]">
              {p.pie}
            </span>
          </div>
        );
      })}

      {e.porCobrar > 0 ? (
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Quedan <strong className="text-[var(--warn)]">$ {e.porCobrar.toFixed(2)}</strong> sin
          cobrar de lo ya facturado.
        </p>
      ) : null}
    </div>
  );
}
