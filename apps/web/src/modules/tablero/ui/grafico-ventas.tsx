"use client";

// Cliente: Recharts necesita el DOM. Se carga aparte con next/dynamic desde
// `ventas.tsx`, así los ~90 kB de la librería no entran al bundle inicial —
// en la demo se importaba estáticamente y viajaba en cada carga del tablero.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PuntoSerie } from "../api/consultas";

const dolares = (n: number) =>
  n.toLocaleString("es-PE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const dolaresExactos = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

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
  tick: { fontSize: 12, fill: "var(--fg-subtle)" },
  // Con muchos periodos, que la librería salte etiquetas antes de apilarlas.
  interval: "preserveStartEnd" as const,
  minTickGap: 16,
};

const EJE_Y = {
  tickLine: false,
  axisLine: false,
  width: 72,
  tick: { fontSize: 12, fill: "var(--fg-subtle)" },
  tickFormatter: (v: number) => dolares(v),
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
    fontSize: 13,
  },
  labelStyle: { color: "var(--fg)", fontWeight: 600 },
};

const MARGENES = { top: 8, right: 8, bottom: 0, left: 0 };

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

  const enBarras = datos.length <= 4;

  /*
    Con pocos puntos, las marcas del área se dibujan.

    Por debajo de ~15 periodos se ven y además dan dónde apuntar con el ratón,
    que en un trazo de dos píxeles es un blanco imposible.
  */
  const conPuntos = datos.length <= 15;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-64 w-full">
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
              />
              {mostrarMargen ? (
                <Bar
                  dataKey="margen"
                  fill="var(--viz-3)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={72}
                />
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
              />
              {mostrarMargen ? (
                <Line
                  type="monotone"
                  dataKey="margen"
                  stroke="var(--viz-3)"
                  strokeWidth={2}
                  dot={conPuntos ? { r: 4, fill: "var(--viz-3)", strokeWidth: 0 } : false}
                  activeDot={{ r: 5 }}
                />
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
