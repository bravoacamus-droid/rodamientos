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

import {
  CajaGlobo,
  FilaGlobo,
  Leyenda,
  RADIO_ARRIBA,
  REJILLA,
  anchoTexto,
  cifraCorta,
  cifraEncima,
  margenGrafico,
  propsEjeX,
  propsEjeY,
  useAncho,
  useLetraGrafico,
} from "@/modules/reportes/ui/graficos-base";

/**
 * Los gráficos del tablero ejecutivo.
 *
 * Las mismas reglas que los de Informes (`reportes/ui/graficos.tsx`), y desde
 * el 27/11 las mismas PIEZAS (`graficos-base`), para que las dos pantallas se
 * lean igual:
 *
 *  · Colores por token (`--viz-*`), que cambian con el tema.
 *  · Sin animación de recharts: con cada bloque llegando por su Suspense, las
 *    barras se quedaban en el fotograma cero y el gráfico salía vacío.
 *  · La letra del `<html>` en ejes, cifras, leyenda y globo, con suelo de
 *    15 px. Hasta el 27/11 eran 14 px fijos y no crecían con el ajuste de
 *    `/accesibilidad`.
 *
 * Y una propia: **lo que se compara va en gris**. El periodo elegido es el
 * protagonista (azul); la comparación es la referencia, y en gris se lee como
 * «lo de antes» sin explicarlo. Dos colores vivos competirían por la vista.
 */

export type Formato = "dinero" | "numero";

const fmtLargo = (n: number, formato: Formato): string =>
  formato === "dinero"
    ? `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n.toLocaleString("es-PE", { maximumFractionDigits: 0 });

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
  const apilado = series.some((s) => s.apilado);
  const total = apilado ? series.reduce((t, s) => t + Number(fila?.[s.clave] ?? 0), 0) : null;
  return (
    <CajaGlobo titulo={fila?.etiqueta}>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.clave);
        if (!p || p.value === null || p.value === undefined) return null;
        const quien = s.esPrevio ? (fila?.etiquetaPrevia ?? null) : null;
        return (
          <FilaGlobo
            key={s.clave}
            color={s.color}
            nombre={`${s.nombre}${quien && !s.apilado ? ` · ${quien}` : ""}`}
            valor={fmtLargo(p.value, formato)}
          />
        );
      })}
      {total !== null ? (
        <p className="mt-1 flex items-center gap-2 border-t border-[var(--border-soft)] pt-1.5">
          <span className="font-semibold">Total</span>
          <span className="tabular ml-auto pl-4 font-bold">{fmtLargo(total, formato)}</span>
        </p>
      ) : null}
    </CajaGlobo>
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
  const px = useLetraGrafico();
  const apilado = series.some((s) => s.apilado);
  const principales = series.filter((s) => !s.esPrevio);

  // La cifra encima de cada grupo, solo si cabe a la letra de hoy: con 24
  // barras en un teléfono se pisarían y no se leería ninguna. Solo lleva
  // cifra la serie de este periodo: la comparación está en el globo.
  const valores = datos.map((d) =>
    apilado
      ? series.reduce((t, x) => t + Number(d[x.clave] ?? 0), 0)
      : Math.max(0, ...principales.map((s) => Number(d[s.clave] ?? 0))),
  );
  const mayor = anchoTexto(cifraCorta(Math.max(0, ...valores)), px);
  const util = ancho - px * 4.6;
  const conCifras =
    ancho > 0 && util / Math.max(1, datos.length) >= mayor * (apilado ? 1 : principales.length) + 8;
  // Cada cuántas etiquetas del eje se pinta una, para que no se monten.
  const mayorEtiqueta = Math.max(0, ...datos.map((d) => anchoTexto(String(d.etiqueta), px)));
  const salto = ancho > 0 ? Math.max(0, Math.ceil((datos.length * mayorEtiqueta) / Math.max(1, util)) - 1) : 0;
  const altura = Math.round(alto * Math.max(1, px / 17));
  const Cifra = cifraEncima(px);

  return (
    <div ref={ref} className="w-full">
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart
          data={datos}
          margin={margenGrafico(px, 8)}
          barCategoryGap={datos.length > 16 ? "12%" : "18%"}
          barGap={4}
        >
          <CartesianGrid {...REJILLA} />
          <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval={salto} />
          <YAxis
            {...propsEjeY(px)}
            allowDecimals={false}
            tickFormatter={(v: number) => (formato === "numero" ? v.toLocaleString("es-PE") : cifraCorta(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-3)" }}
            content={<Globo formato={formato} series={series} />}
          />
          {/*
            La comparación se dibuja PRIMERO: queda a la izquierda («antes» y
            luego «ahora», como se lee) y, sobre todo, debajo. Dibujada después
            tapaba la cifra de la barra azul cuando la gris era más alta.
          */}
          {[...series.filter((x) => x.esPrevio), ...principales].map((s, i, orden) => {
            const ultimaApilada = apilado && i === orden.length - 1;
            return (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.nombre}
                fill={s.color}
                stackId={s.apilado ? "pila" : undefined}
                isAnimationActive={false}
                radius={!apilado || ultimaApilada ? RADIO_ARRIBA : 0}
                maxBarSize={64}
                // La separación entre partes apiladas, del color del fondo.
                stroke={apilado ? "var(--surface)" : undefined}
                strokeWidth={apilado ? 2 : 0}
              >
                {conCifras && (!apilado || ultimaApilada) && !s.esPrevio ? (
                  <LabelList
                    dataKey={apilado ? undefined : s.clave}
                    valueAccessor={
                      apilado
                        ? (e: { payload?: Fila }) =>
                            series.reduce((t, x) => t + Number(e.payload?.[x.clave] ?? 0), 0)
                        : undefined
                    }
                    content={Cifra}
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
