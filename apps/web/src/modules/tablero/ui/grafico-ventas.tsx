"use client";

// Cliente: Recharts necesita el DOM. Se carga aparte con next/dynamic desde
// `ventas.tsx`, así los ~90 kB de la librería no entran al bundle inicial —
// en la demo se importaba estáticamente y viajaba en cada carga del tablero.

import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PuntoSerie } from "../api/consultas";

const dolaresExactos = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/**
 * La cifra corta del eje y de las etiquetas: «20 mil», «4.5 mil», «850».
 *
 * Revisión por módulos del 02/10: el eje decía «USD 20,000» a 14 px en una
 * columna de 72 y se comía la primera letra —«SD 20,000», «JSD 5,000»—. Y
 * repetir «USD» en cada marca no añade nada: la moneda va UNA vez, en el
 * título del gráfico.
 */
export function cifraCorta(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return Math.round(n).toLocaleString("es-PE");
  const miles = n / 1000;
  return `${miles.toLocaleString("es-PE", {
    maximumFractionDigits: Math.abs(miles) >= 10 ? 0 : 1,
  })} mil`;
}

/** Ancho real del gráfico, para decidir si caben las cifras sobre los puntos. */
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/*
  Las props de los ejes, compartidas por los dos gráficos.

  Se comparten las PROPS y no los elementos: cada gráfico monta su propio
  `<XAxis>` literal. Recharts recorre `children` buscando sus componentes por
  tipo, y cualquier cosa que los envuelva —un fragmento, un componente
  propio— los esconde. Cuando eso pasa el gráfico sale en blanco **sin ningún
  error en consola**, que es lo que lo hace tan difícil de ver: pasó aquí
  mismo el 09/09 al meter las barras.
*/
const EJE_X = {
  dataKey: "mes",
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 14, fill: "var(--fg-subtle)" },
  // Con muchos periodos, que la librería salte etiquetas antes de apilarlas.
  interval: "preserveStartEnd" as const,
  minTickGap: 16,
};

const EJE_Y = {
  tickLine: false,
  axisLine: false,
  width: 64,
  tick: { fontSize: 14, fill: "var(--fg-muted)" },
  tickFormatter: (v: number) => cifraCorta(v),
};

/*
  Las cifras encima de cada punto o barra.

  Willy, del tablero: *«se ve feíto»*. Lo que más le faltaba era LEERLO sin
  pasar el ratón: el globo solo sale al apuntar, y en el teléfono casi nunca.
  Con la cifra escrita sobre cada mes el gráfico se lee de un vistazo, que es
  para lo que está (revisión por módulos del 02/10). Solo se ponen si caben
  —ver `caben`—; amontonadas serían peor que ninguna.
*/
const ETIQUETA_VALOR = {
  position: "top" as const,
  offset: 8,
  fontSize: 14,
  fill: "var(--fg)",
  formatter: (v: unknown) => (typeof v === "number" && v !== 0 ? cifraCorta(v) : ""),
};

const REJILLA = {
  strokeDasharray: "3 3",
  stroke: "var(--border-soft)",
  vertical: false,
};

const GLOBO = {
  formatter: (valor: number, nombre: string) =>
    [dolaresExactos(valor), nombre === "venta" ? "Vendido" : "Margen"] as [string, string],
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 14,
  },
  labelStyle: { color: "var(--fg)", fontWeight: 600 },
};

// Arriba y a la derecha con aire: arriba va la cifra del punto más alto, y a
// la derecha la del último mes, que si no se corta contra el borde.
const MARGENES = { top: 28, right: 24, bottom: 0, left: 0 };

/**
 * Venta y margen a lo largo del periodo.
 *
 * ---------------------------------------------------------------------------
 * Dos formas, según cuántos periodos haya
 * ---------------------------------------------------------------------------
 * Un **área** necesita recorrido para decir algo: con uno o dos puntos no hay
 * pendiente que mirar y sale un rectángulo vacío con un puntito perdido — que
 * es literalmente lo que el tablero enseñaba el 09/09 con una sola factura en
 * el mes. Luis: *«¿dónde están los gráficos? En mi tablero no hay ninguno»*.
 *
 * Una **barra** se lee sola: tiene altura y se compara contra el eje aunque
 * esté sola. Y como el tablero abre en «este mes», a primeros de mes ese es el
 * caso normal y no la excepción.
 *
 * Son dos componentes distintos de Recharts y no uno con dos modos, porque una
 * barra ocupa un INTERVALO del eje y una línea un PUNTO. `BarChart` reparte el
 * eje en bandas y centra las etiquetas bajo cada barra; forzar eso dentro de
 * un gráfico de líneas deja el rótulo descolocado a un lado.
 *
 * ---------------------------------------------------------------------------
 * Un solo eje, siempre
 * ---------------------------------------------------------------------------
 * Las dos series están en la misma unidad —dólares— y comparten escala. Dos
 * ejes verticales en un gráfico es la forma más habitual de mentir con datos:
 * el punto donde se cruzan las curvas lo decide quien elige las escalas, no el
 * negocio.
 *
 * El margen es parte de la venta, así que va por debajo por construcción, y la
 * distancia entre los dos es lo que costó.
 */
export function GraficoVentas({
  meses,
  mostrarMargen = true,
  ultimoEnCurso = false,
}: {
  meses: PuntoSerie[];
  /**
   * Si el margen se puede dibujar.
   *
   * `false` cuando el periodo no trae costo o el que trae es imposible: una
   * línea de margen sobre datos falsos es peor que ninguna línea, porque una
   * gráfica se cree sin leer la letra pequeña.
   */
  mostrarMargen?: boolean;
  /**
   * El último punto cubre un periodo que aún no ha terminado.
   *
   * Se dice porque si no, engaña: mirando doce meses el 9 de septiembre, el
   * último punto son nueve días contra once meses enteros, y el gráfico dibuja
   * un desplome que no ha pasado.
   */
  ultimoEnCurso?: boolean;
}) {
  const datos = meses.map((m) => ({
    mes: m.etiqueta,
    venta: m.venta,
    margen: m.margen,
  }));

  /*
    Barras hasta doce periodos (revisión por módulos del 02/10).

    Antes solo con cuatro o menos. Mirando «este año» por mes, el área
    dibujaba una ola que subía y bajaba ENTRE los meses —entre marzo y abril
    no hay «venta de mitad de mes», hay dos totales— y el valle de mayo
    parecía tocar el cero. Un total por mes es una barra: se compara con la
    de al lado sin interpretar curvas. El área queda para muchos periodos
    (los días de un mes), donde sí hay recorrido que mirar.
  */
  const enBarras = datos.length <= 12;

  /*
    Con pocos puntos, las marcas del área se dibujan.

    Por debajo de ~15 periodos se ven y además dan dónde apuntar con el ratón,
    que en un trazo de dos píxeles es un blanco imposible.
  */
  const conPuntos = datos.length <= 15;

  // ~72 px por periodo es lo que ocupa «12.5 mil» a 14 px con su respiro; con
  // el margen al lado, en barras, son dos cifras por periodo.
  const [ref, ancho] = useAncho();
  const porPeriodo = ancho / Math.max(datos.length, 1);
  const caben = ancho > 0 && porPeriodo >= (mostrarMargen ? 130 : 72);

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {enBarras ? (
            <BarChart data={datos} margin={MARGENES}>
              <CartesianGrid {...REJILLA} />
              <XAxis {...EJE_X} />
              <YAxis {...EJE_Y} />
              <Tooltip {...GLOBO} cursor={{ fill: "var(--surface-2)" }} />
              {/* Ancho con tope: una barra sola ocupando todo el gráfico
                  parece un error de maquetación, no un dato. */}
              <Bar
                dataKey="venta"
                fill="var(--viz-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
                isAnimationActive={false}
              >
                {caben ? <LabelList dataKey="venta" {...ETIQUETA_VALOR} /> : null}
              </Bar>
              {mostrarMargen ? (
                <Bar
                  dataKey="margen"
                  fill="var(--viz-3)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={72}
                  isAnimationActive={false}
                >
                  {caben ? <LabelList dataKey="margen" {...ETIQUETA_VALOR} /> : null}
                </Bar>
              ) : null}
            </BarChart>
          ) : (
            <AreaChart data={datos} margin={MARGENES}>
              <defs>
                <linearGradient id="degradadoVenta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...REJILLA} />
              <XAxis {...EJE_X} />
              <YAxis {...EJE_Y} />
              {/* La guía en vertical: sobre un trazo fino el punto exacto es
                  un blanco imposible, y así basta con estar sobre la columna. */}
              <Tooltip {...GLOBO} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="venta"
                stroke="var(--viz-1)"
                strokeWidth={2}
                fill="url(#degradadoVenta)"
                dot={conPuntos ? { r: 4, fill: "var(--viz-1)", strokeWidth: 0 } : false}
                activeDot={{ r: 5 }}
                // Sin animación: el trazo crecía desde cero en cada cambio de
                // filtro y durante ese segundo el gráfico decía otra cosa.
                isAnimationActive={false}
              >
                {caben ? <LabelList dataKey="venta" {...ETIQUETA_VALOR} /> : null}
              </Area>
              {mostrarMargen ? (
                <Line
                  type="monotone"
                  dataKey="margen"
                  stroke="var(--viz-3)"
                  strokeWidth={2}
                  dot={conPuntos ? { r: 4, fill: "var(--viz-3)", strokeWidth: 0 } : false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                >
                  {caben ? (
                    <LabelList
                      dataKey="margen"
                      {...ETIQUETA_VALOR}
                      position="bottom"
                      fill="var(--viz-3)"
                    />
                  ) : null}
                </Line>
              ) : null}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/*
        Leyenda propia, no la de la librería.

        Con dos series el color solo no basta para saber cuál es cuál, y no por
        gusto: quien no distingue bien los colores se queda sin poder leer el
        gráfico. Se escribe a mano para que use la tipografía del sistema y
        respete el tamaño mínimo —la de Recharts sale a 12 px—.
      */}
      <div className="flex flex-wrap items-center gap-4 pl-2 text-sm text-[var(--fg-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ background: "var(--viz-1)" }}
          />
          Vendido
        </span>
        {mostrarMargen ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px]"
              style={{ background: "var(--viz-3)" }}
            />
            Margen
          </span>
        ) : (
          // Se dice por qué falta. Sin esto, quien conoce el gráfico pensaría
          // que el margen fue cero.
          <span className="text-[var(--fg-subtle)]">
            El margen no se dibuja: falta el costo de estas ventas.
          </span>
        )}

        {ultimoEnCurso ? (
          <span className="ml-auto text-[var(--warn)]">
            El último periodo va a medias: todavía no ha terminado.
          </span>
        ) : null}
      </div>
    </div>
  );
}
