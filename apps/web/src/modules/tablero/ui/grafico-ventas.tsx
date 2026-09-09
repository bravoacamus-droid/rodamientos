"use client";

// Cliente: Recharts necesita el DOM. Se carga aparte con next/dynamic desde
// `ventas.tsx`, así los ~90 kB de la librería no entran al bundle inicial —
// en la demo se importaba estáticamente y viajaba en cada carga del tablero.

import {
  Area,
  AreaChart,
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

/**
 * Venta y margen a lo largo del periodo.
 *
 * ---------------------------------------------------------------------------
 * Por qué área para la venta y línea para el margen
 * ---------------------------------------------------------------------------
 * Las dos series están en la MISMA unidad —dólares— y comparten un solo eje.
 * Eso no es negociable: dos escalas verticales en un gráfico es la forma más
 * habitual de mentir con datos, porque el cruce de las dos curvas lo decide
 * quien elige las escalas y no el negocio.
 *
 * El margen es una parte de la venta, así que va debajo por construcción. Con
 * área para el total y línea para la parte se compara sin que compitan: la
 * masa dice cuánto se vendió, el trazo cuánto de eso se ganó, y la distancia
 * entre los dos es lo que costó.
 *
 * ---------------------------------------------------------------------------
 * Leyenda, siempre
 * ---------------------------------------------------------------------------
 * Con dos series el color solo no basta para saber cuál es cuál —y no por
 * gusto: quien no distingue bien los colores se queda sin poder leer el
 * gráfico—. Va como leyenda propia y no como la de la librería para que use
 * la tipografía del sistema y respete el tamaño mínimo.
 */
export function GraficoVentas({
  meses,
  mostrarMargen = true,
  ultimoEnCurso = false,
}: {
  meses: PuntoSerie[];
  /**
   * El último punto cubre un periodo que aún no ha terminado.
   *
   * Se dice porque si no, engaña: mirando doce meses el 9 de septiembre, el
   * último punto son nueve días contra once meses enteros, y el gráfico dibuja
   * un desplome que no ha pasado.
   */
  ultimoEnCurso?: boolean;
  /**
   * Si el margen se puede dibujar.
   *
   * `false` cuando el periodo no trae costo o el que trae es imposible: una
   * línea de margen sobre datos falsos es peor que ninguna línea, porque una
   * gráfica se cree sin leer la letra pequeña.
   */
  mostrarMargen?: boolean;
}) {
  const datos = meses.map((m) => ({
    mes: m.etiqueta,
    venta: m.venta,
    margen: m.margen,
  }));

  /*
    Con pocos puntos, las marcas se dibujan.

    Un área de un solo punto no pinta nada: el 09/09, con una única factura en
    el mes, el tablero enseñaba un gráfico vacío con un puntito perdido. Por
    debajo de ~15 periodos los puntos se ven y además dan dónde apuntar con el
    ratón, que en un área fina es un blanco de dos píxeles.
  */
  const pocos = datos.length <= 15;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="degradadoVenta" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-soft)"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "var(--fg-subtle)" }}
              // Con muchos periodos, que la librería salte etiquetas antes de
              // apilarlas unas sobre otras.
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tick={{ fontSize: 12, fill: "var(--fg-subtle)" }}
              tickFormatter={(v: number) => dolares(v)}
            />
            <Tooltip
              // La guía en vertical: con un área fina, el punto exacto es un
              // blanco imposible, y así basta con estar sobre la columna.
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              formatter={(valor: number, nombre: string) => [
                dolaresExactos(valor),
                nombre === "venta" ? "Vendido" : "Margen",
              ]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
            />

            <Area
              type="monotone"
              dataKey="venta"
              stroke="var(--viz-1)"
              strokeWidth={2}
              fill="url(#degradadoVenta)"
              dot={pocos ? { r: 4, fill: "var(--viz-1)", strokeWidth: 0 } : false}
              activeDot={{ r: 5 }}
            />

            {mostrarMargen ? (
              <Line
                type="monotone"
                dataKey="margen"
                stroke="var(--viz-3)"
                strokeWidth={2}
                dot={pocos ? { r: 4, fill: "var(--viz-3)", strokeWidth: 0 } : false}
                activeDot={{ r: 5 }}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>

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
          // Se dice por qué falta la línea. Sin esto, quien conoce el gráfico
          // pensaría que el margen fue cero.
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
