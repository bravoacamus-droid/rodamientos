"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { COLOR_AGING, etiquetaAging } from "../dominio/periodo";
import type {
  FamiliaValorizada,
  MesVentas,
  ProductoVendido,
  PuntoCompras,
  PuntoVentas,
  TramoCartera,
} from "../dominio/tipos";

/**
 * Los gráficos de los informes.
 *
 * Todos son componentes de cliente porque recharts mide el DOM para
 * dimensionarse. Los datos llegan YA calculados desde el servidor: aquí no se
 * suma ni se filtra nada, solo se pinta.
 *
 * Tres reglas que comparten:
 *
 *  · **Colores por token, no fijos.** Los tokens del tema cambian con él; un
 *    `#0e4c73` escrito a mano se queda oscuro sobre fondo oscuro.
 *  · **Sin leyenda cuando hay una sola serie.** Una leyenda que dice «venta»
 *    encima de un gráfico titulado «Ventas» solo ocupa sitio.
 *  · **Animación de entrada, pero una vez.** Recharts reanima en cada
 *    renderizado si no se le dice que no, y un gráfico que se redibuja al
 *    cambiar un filtro distrae en vez de informar.
 */

/**
 * La animación interna de recharts va APAGADA. A propósito.
 *
 * Con ella, los rectángulos de las barras se quedaban en el fotograma cero y
 * recharts no los dibujaba: el `<g class="recharts-bar-rectangle">` estaba
 * ahí, vacío, y el gráfico salía en blanco con los ejes puestos. Pasa cuando
 * el componente se vuelve a renderizar a mitad de la animación, que aquí es lo
 * normal — cada bloque llega por su propio `<Suspense>` y se hidrata cuando le
 * toca.
 *
 * Un gráfico que a veces sale vacío es mucho peor que uno que no crece: el
 * primero se lee como «no hay datos» y manda a alguien a buscar un problema
 * que no existe.
 *
 * La sensación de entrada la da igual el contenedor, que lleva `anim-entrada`
 * en CSS y no depende de que recharts termine nada.
 */
const ANIMAR = false;

/** Formato de dinero corto para los ejes: 12.4k en vez de 12 400. */
function corto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

const dinero = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Tooltip propio.
 *
 * El de recharts hereda estilos del navegador y en tema oscuro sale blanco
 * sobre blanco. Este usa los mismos tokens que el resto de la aplicación.
 */
function Globo({
  active,
  payload,
  label,
  formato = dinero,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  formato?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs elev-2">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: p.color }}
            aria-hidden="true"
          />
          <span className="text-[var(--fg-muted)]">{p.name}</span>
          <span className="tabular ml-auto font-medium">{formato(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

const EJE = {
  stroke: "var(--fg-subtle)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

// ---------------------------------------------------------------------------
// Ventas mensuales
// ---------------------------------------------------------------------------

/**
 * La serie de ventas, con el margen encima.
 *
 * Área para la venta y línea para el margen, no dos áreas: son magnitudes de
 * escala muy distinta y superpuestas la pequeña desaparece. La línea se lee
 * como «cuánto de eso me queda».
 */
export function GraficoVentas({ datos }: { datos: MesVentas[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="rt-grad-venta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={52} />
        <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)" }} />
        <Area
          type="monotone"
          dataKey="ventaNeta"
          name="Venta neta"
          stroke="var(--color-brand-600)"
          strokeWidth={2}
          fill="url(#rt-grad-venta)"
          isAnimationActive={ANIMAR}
        />
        <Line
          type="monotone"
          dataKey="margen"
          name="Margen"
          stroke="var(--ok)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={ANIMAR}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Top de productos
// ---------------------------------------------------------------------------

/**
 * Ranking de productos, en barras HORIZONTALES.
 *
 * Vertical no vale: los códigos de rodamiento («6205-2RS1/C3») no caben
 * girados y acaban recortados o en diagonal, que es de lo más difícil de leer
 * que hay.
 */
export function GraficoTopProductos({ datos }: { datos: ProductoVendido[] }) {
  const altura = Math.max(200, datos.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
        <XAxis type="number" tickFormatter={corto} {...EJE} />
        <YAxis
          type="category"
          dataKey="codigo"
          width={110}
          {...EJE}
          tick={{ fontSize: 11, fill: "var(--fg-muted)", fontFamily: "ui-monospace, monospace" }}
        />
        <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar
          dataKey="venta"
          name="Vendido"
          radius={[0, 4, 4, 0]}
          isAnimationActive={ANIMAR}
        >
          {datos.map((p) => (
            // El color dice el margen, no el puesto: un producto que vende
            // mucho con margen bajo es el que hay que mirar, y en un ranking
            // monocromo se confunde con el que vende mucho y gana.
            <Cell
              key={p.id}
              fill={
                p.margenPct >= 20
                  ? "var(--ok)"
                  : p.margenPct >= 10
                    ? "var(--color-brand-500)"
                    : "var(--warn)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Aging de cartera
// ---------------------------------------------------------------------------

/** Cuánto se debe y desde cuándo, del verde al rojo. */
export function GraficoAging({ datos }: { datos: TramoCartera[] }) {
  const conEtiqueta = datos.map((t) => ({ ...t, nombre: etiquetaAging(t.tramo) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={conEtiqueta} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="nombre" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={52} />
        <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="saldo" name="Saldo" radius={[4, 4, 0, 0]} isAnimationActive={ANIMAR}>
          {conEtiqueta.map((t) => (
            <Cell key={t.tramo} fill={COLOR_AGING[t.tramo] ?? "var(--fg-subtle)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Valorización del inventario
// ---------------------------------------------------------------------------

const COLORES_FAMILIA = [
  "var(--color-brand-600)",
  "var(--color-brand-400)",
  "var(--color-accent-400)",
  "var(--ok)",
  "var(--warn)",
];

/**
 * Reparto del capital inmovilizado, en anillo.
 *
 * Anillo y no tarta: el hueco del centro deja sitio para el total, que es el
 * número que de verdad se busca al abrir este gráfico.
 */
export function GraficoValorizacion({ datos }: { datos: FamiliaValorizada[] }) {
  const total = datos.reduce((a, f) => a + f.valorCosto, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={datos}
            dataKey="valorCosto"
            nameKey="familia"
            innerRadius="58%"
            outerRadius="86%"
            // Con UNA sola porción el hueco entre porciones no separa nada: la
            // recorta y el anillo sale como una cuña suelta. Se ve en cuanto el
            // catálogo tiene una sola familia, que es hoy mismo.
            paddingAngle={datos.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={ANIMAR}
          >
            {datos.map((f, i) => (
              <Cell key={f.familia} fill={COLORES_FAMILIA[i % COLORES_FAMILIA.length]} />
            ))}
          </Pie>
          <Tooltip content={<Globo />} />
        </PieChart>
      </ResponsiveContainer>

      {/* El total va en el hueco: es el número que se busca al abrir esto. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-[var(--fg-muted)]">A costo</span>
        <span className="tabular text-lg font-semibold">{dinero(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series por rango (26/08)
// ---------------------------------------------------------------------------

/**
 * Ventas del rango, con la granularidad que se haya elegido.
 *
 * Es el mismo dibujo que `GraficoVentas` pero sobre `PuntoVentas`, que no es
 * el mismo tipo: la serie mensual trae `ventaNeta` y la del rango trae `venta`.
 * Se dejan separados en vez de renombrar una de las dos, porque el nombre de
 * cada campo dice de dónde sale el número, y unificarlo obligaría a tocar el
 * tablero para arreglar los informes.
 */
export function GraficoSerieVentas({ datos }: { datos: PuntoVentas[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="rt-grad-serie" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={52} />
        <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)" }} />
        <Area
          type="monotone"
          dataKey="venta"
          name="Venta neta"
          stroke="var(--color-brand-600)"
          strokeWidth={2}
          fill="url(#rt-grad-serie)"
          isAnimationActive={ANIMAR}
        />
        <Line
          type="monotone"
          dataKey="margen"
          name="Margen"
          stroke="var(--ok)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={ANIMAR}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Costo de las órdenes de compra, en barras.
 *
 * Barras y no área a propósito: una compra es un hecho puntual —se firmó una
 * orden ese día— y no una magnitud que fluye. El área invita a leer la
 * pendiente entre dos puntos, y entre dos compras no hay pendiente que leer.
 *
 * Los gastos de importación van apilados encima del subtotal, porque son
 * costo igual y verlos aparte responde «¿cuánto de esto fue flete?».
 */
export function GraficoSerieCompras({ datos }: { datos: PuntoCompras[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={52} />
        <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar
          dataKey="subtotal"
          name="Mercadería"
          stackId="costo"
          fill="var(--color-brand-500)"
          isAnimationActive={ANIMAR}
        />
        <Bar
          dataKey="gastos"
          name="Gastos de importación"
          stackId="costo"
          fill="var(--color-accent-400)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={ANIMAR}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
