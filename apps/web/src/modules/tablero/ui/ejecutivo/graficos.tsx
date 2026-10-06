"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Los gráficos del tablero ejecutivo.
 *
 * Las mismas reglas que los de Informes (`reportes/ui/graficos.tsx`), para
 * que las dos pantallas se lean igual:
 *
 *  · Colores por token (`--viz-*`), que cambian con el tema.
 *  · Sin animación de recharts: con cada bloque llegando por su Suspense, las
 *    barras se quedaban en el fotograma cero y el gráfico salía vacío.
 *  · Letra a 14 px en ejes, leyenda y globo.
 *
 * Y una propia: **lo que se compara va en gris**. El periodo elegido es el
 * protagonista (azul); la comparación es la referencia, y en gris se lee como
 * «lo de antes» sin explicarlo. Dos colores vivos competirían por la vista.
 */

export type Formato = "dinero" | "numero";

const fmtCorto = (n: number): string => {
  const abs = Math.abs(n);
  const f = (x: number) =>
    x.toLocaleString("es-PE", { maximumFractionDigits: Math.abs(x) >= 10 ? 0 : 1 });
  if (abs >= 1_000_000) return `${f(n / 1_000_000)} mill.`;
  if (abs >= 1_000) return `${f(n / 1_000)} mil`;
  return String(Math.round(n));
};

const fmtLargo = (n: number, formato: Formato): string =>
  formato === "dinero"
    ? `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n.toLocaleString("es-PE", { maximumFractionDigits: 0 });

const EJE = {
  stroke: "var(--viz-ink)",
  fontSize: 14,
  tickLine: false,
  axisLine: false,
} as const;

function useAncho() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

function Leyenda({ items }: { items: { color: string; texto: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[var(--fg-muted)]">
      {items.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-[3px]" style={{ background: i.color }} />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

interface Fila {
  etiqueta: string;
  /** Cómo se llama el periodo de comparación de esta barra: «ago 25». */
  etiquetaPrevia?: string | null;
  [serie: string]: string | number | null | undefined;
}

/** El globo: cada serie con su propio periodo, para no comparar a ciegas. */
function Globo({
  active,
  payload,
  formato,
  series,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; payload?: Fila }[];
  formato: Formato;
  series: SerieGrafico[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0]?.payload;
  return (
    <div className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm elev-2">
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.clave);
        if (!p || p.value === null || p.value === undefined) return null;
        const quien = s.esPrevio ? (fila?.etiquetaPrevia ?? s.nombre) : fila?.etiqueta;
        return (
          <p key={s.clave} className="flex items-center gap-2 py-0.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-[var(--fg-muted)]">
              {s.nombre}
              {quien && !s.apilado ? ` · ${quien}` : ""}
            </span>
            <span className="tabular ml-auto pl-4 font-semibold">{fmtLargo(p.value, formato)}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * La cifra encima de la barra, dibujada a mano.
 *
 * La etiqueta de recharts ajusta el texto al ancho de la barra y partía
 * «11 mil» en dos líneas, «11» y «mil», que ya no se leen como una cifra
 * (06/10, en pantalla). Un `<text>` suelto no se parte.
 */
function CifraEncima(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}) {
  const v = typeof props.value === "number" ? props.value : Number(props.value);
  if (!Number.isFinite(v) || v === 0) return null;
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
  const y = Number(props.y ?? 0) - 7;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={14}
      fill="var(--fg)"
      // Un borde del color del fondo, por si la cifra pisa la barra vecina.
      stroke="var(--surface)"
      strokeWidth={4}
      paintOrder="stroke"
      className="tabular"
    >
      {fmtCorto(v)}
    </text>
  );
}

export interface SerieGrafico {
  clave: string;
  nombre: string;
  color: string;
  /** La serie de comparación: su globo dice el periodo de ella, no el actual. */
  esPrevio?: boolean;
  apilado?: boolean;
}

/**
 * Barras por periodo, agrupadas (este periodo y su comparación) o apiladas
 * (las partes de un total: clientes nuevos sobre los de siempre).
 */
export function GraficoBarras({
  datos,
  series,
  formato = "dinero",
  alto = 280,
}: {
  datos: Fila[];
  series: SerieGrafico[];
  formato?: Formato;
  alto?: number;
}) {
  const [ref, ancho] = useAncho();
  const apilado = series.some((s) => s.apilado);
  // La cifra encima de cada grupo, solo si cabe: «15 mil» a 14 px pide unos
  // 50 px, y con 24 barras en un teléfono se pisarían y no se leería ninguna.
  // Solo lleva cifra la serie de este periodo: la comparación está en el globo.
  const conCifras = ancho > 0 && (ancho - 64) / Math.max(1, datos.length) >= (formato === "numero" ? 30 : 52);
  // Cada cuántas etiquetas del eje se pinta una, para que no se monten.
  const salto = ancho > 0 ? Math.max(0, Math.ceil((datos.length * 58) / ancho) - 1) : 0;

  return (
    <div ref={ref} className="w-full">
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart
          data={datos}
          margin={{ top: 26, right: 8, left: 0, bottom: 0 }}
          barCategoryGap={datos.length > 16 ? "12%" : "22%"}
          barGap={2}
        >
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="etiqueta" {...EJE} interval={salto} dy={6} />
          <YAxis {...EJE} width={64} tickFormatter={(v: number) => fmtCorto(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-3)" }}
            content={<Globo formato={formato} series={series} />}
          />
          {/*
            La comparación se dibuja PRIMERO: queda a la izquierda («antes» y
            luego «ahora», como se lee) y, sobre todo, debajo. Dibujada después
            tapaba la cifra de la barra azul cuando la gris era más alta.
          */}
          {[...series.filter((x) => x.esPrevio), ...series.filter((x) => !x.esPrevio)].map((s, i, orden) => {
            const ultimaApilada = apilado && i === orden.length - 1;
            return (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.nombre}
                fill={s.color}
                stackId={s.apilado ? "pila" : undefined}
                isAnimationActive={false}
                radius={!apilado || ultimaApilada ? [4, 4, 0, 0] : 0}
                maxBarSize={44}
                // La separación de 2 px entre partes apiladas, del color del fondo.
                stroke={apilado ? "var(--surface)" : undefined}
                strokeWidth={apilado ? 1 : 0}
              >
                {conCifras && (!apilado || ultimaApilada) && !s.esPrevio ? (
                  <LabelList
                    dataKey={apilado ? undefined : s.clave}
                    position="top"
                    offset={6}
                    fontSize={14}
                    fill="var(--fg)"
                    valueAccessor={
                      apilado
                        ? (e: { payload?: Fila }) =>
                            series.reduce((t, x) => t + Number(e.payload?.[x.clave] ?? 0), 0)
                        : undefined
                    }
                    content={CifraEncima}
                  />
                ) : null}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 1 ? (
        <Leyenda items={series.map((s) => ({ color: s.color, texto: s.nombre }))} />
      ) : null}
    </div>
  );
}
