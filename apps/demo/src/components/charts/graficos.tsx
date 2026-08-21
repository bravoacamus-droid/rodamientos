"use client";

/**
 * Gráficos del ERP · Recharts
 *
 * Reglas aplicadas:
 *  · Un solo eje Y por gráfico (nunca doble escala). Las series que conviven
 *    comparten unidad (soles).
 *  · Paleta categórica validada (contraste, banda de luminosidad, separación CVD)
 *    en modo claro y oscuro; el amarillo de marca NO transporta datos porque no
 *    alcanza 3:1 sobre blanco — se reserva para acentos de interfaz.
 *  · Rampa ordinal de un solo tono para magnitudes ordenadas (aging).
 *  · Leyenda presente con 2+ series; etiquetas directas selectivas; rejilla discreta.
 */

import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, BarChart, LabelList,
} from "recharts";
import { money, moneyShort, num, pct } from "@/lib/utils";

const EJE = {
  stroke: "var(--viz-axis)",
  tick: { fill: "var(--viz-ink-soft)", fontSize: 11 },
  tickLine: false,
};

const ORD = ["var(--viz-ord-1)", "var(--viz-ord-2)", "var(--viz-ord-3)", "var(--viz-ord-4)", "var(--viz-ord-5)"];

/* ------------------------------------------------------------------ Tooltip */

function CajaTooltip({
  active,
  payload,
  label,
  formato = "money",
  sufijo,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  formato?: "money" | "num" | "pct";
  sufijo?: string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = (v: number) =>
    formato === "money" ? money(v) : formato === "pct" ? pct(v) : num(v, 0);

  return (
    <div className="rounded-lg border bg-[var(--surface)] px-3 py-2 elev-3">
      {label && <p className="mb-1.5 text-[11px] font-semibold text-fg">{label}</p>}
      <div className="space-y-1">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <div key={p.dataKey} className="flex items-center gap-2.5 text-[11.5px]">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <span className="text-muted">{p.name}</span>
              <span className="ml-auto font-semibold text-fg tabular">
                {fmt(Number(p.value))}
                {sufijo}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

const leyenda = {
  iconType: "square" as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 11.5, color: "var(--viz-ink)", paddingTop: 4 },
};

/* --------------------------------------------- Ventas mensuales + margen S/ */

export function GraficoVentas({
  data,
  alto = 260,
}: {
  data: { etiqueta: string; venta: number; margen: number }[];
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} axisLine={{ stroke: "var(--viz-axis)" }} />
        <YAxis
          {...EJE}
          axisLine={false}
          width={62}
          tickFormatter={(v) => moneyShort(v)}
        />
        <Tooltip
          content={<CajaTooltip />}
          cursor={{ fill: "var(--viz-grid)", opacity: 0.55 }}
        />
        <Legend {...leyenda} />
        <Bar
          dataKey="venta"
          name="Venta facturada"
          fill="var(--viz-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={30}
        />
        <Line
          dataKey="margen"
          name="Margen bruto"
          type="monotone"
          stroke="var(--viz-2)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: "var(--viz-2)" }}
          activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------------------------------- Proyección de ventas */

export function GraficoProyeccion({
  data,
  alto = 240,
}: {
  data: { etiqueta: string; real: number | null; proyectado: number | null }[];
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} axisLine={{ stroke: "var(--viz-axis)" }} />
        <YAxis {...EJE} axisLine={false} width={62} tickFormatter={(v) => moneyShort(v)} />
        <Tooltip content={<CajaTooltip />} />
        <Legend {...leyenda} />
        <Area
          dataKey="real"
          name="Venta real"
          type="monotone"
          stroke="var(--viz-1)"
          strokeWidth={2}
          fill="url(#gradReal)"
          connectNulls
          dot={false}
        />
        <Area
          dataKey="proyectado"
          name="Tendencia proyectada"
          type="monotone"
          stroke="var(--viz-2)"
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="none"
          connectNulls
          dot={{ r: 2.5, strokeWidth: 0, fill: "var(--viz-2)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------- Barras horizontales (magnitud) */

export function GraficoBarrasH({
  data,
  alto,
  formato = "money",
  color = "var(--viz-1)",
  etiquetaValor = true,
  anchoEje = 150,
}: {
  data: { nombre: string; valor: number }[];
  alto?: number;
  formato?: "money" | "num";
  color?: string;
  etiquetaValor?: boolean;
  anchoEje?: number;
}) {
  const h = alto ?? Math.max(data.length * 30 + 16, 120);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 2, right: etiquetaValor ? 68 : 12, bottom: 2, left: 0 }}
        barCategoryGap={6}
      >
        <CartesianGrid stroke="var(--viz-grid)" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="nombre"
          width={anchoEje}
          {...EJE}
          axisLine={false}
          tick={{ fill: "var(--viz-ink)", fontSize: 11.5 }}
        />
        <Tooltip
          content={<CajaTooltip formato={formato} />}
          cursor={{ fill: "var(--viz-grid)", opacity: 0.5 }}
        />
        <Bar dataKey="valor" name="Valor" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18}>
          {etiquetaValor && (
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => (formato === "money" ? moneyShort(v) : num(v, 0))}
              style={{ fill: "var(--viz-ink)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------ Aging de cartera (ordinal) */

export function GraficoAging({
  data,
  alto = 190,
}: {
  data: { tramo: string; monto: number }[];
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey="tramo" {...EJE} axisLine={{ stroke: "var(--viz-axis)" }} />
        <YAxis {...EJE} axisLine={false} width={62} tickFormatter={(v) => moneyShort(v)} />
        <Tooltip content={<CajaTooltip />} cursor={{ fill: "var(--viz-grid)", opacity: 0.5 }} />
        <Bar dataKey="monto" name="Saldo por cobrar" radius={[4, 4, 0, 0]} maxBarSize={54}>
          {data.map((_, i) => (
            <Cell key={i} fill={ORD[Math.min(i, ORD.length - 1)]} />
          ))}
          <LabelList
            dataKey="monto"
            position="top"
            formatter={(v: number) => moneyShort(v)}
            style={{ fill: "var(--viz-ink)", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------- Comparativo dos series */

export function GraficoComparativo({
  data,
  serie1,
  serie2,
  alto = 240,
}: {
  data: { etiqueta: string; a: number; b: number }[];
  serie1: string;
  serie2: string;
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} axisLine={{ stroke: "var(--viz-axis)" }} />
        <YAxis {...EJE} axisLine={false} width={62} tickFormatter={(v) => moneyShort(v)} />
        <Tooltip content={<CajaTooltip />} cursor={{ fill: "var(--viz-grid)", opacity: 0.5 }} />
        <Legend {...leyenda} />
        <Bar dataKey="a" name={serie1} fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="b" name={serie2} fill="var(--viz-3)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------- Sparkline */

export function Sparkline({
  data,
  alto = 40,
  color = "var(--viz-1)",
}: {
  data: { v: number }[];
  alto?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="v"
          type="monotone"
          stroke={color}
          strokeWidth={1.75}
          fill="url(#gradSpark)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------- Barra de participación simple */

export function BarraParticipacion({
  segmentos,
}: {
  segmentos: { nombre: string; valor: number; color?: string }[];
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {segmentos.map((s, i) => (
          <div
            key={s.nombre}
            className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500"
            style={{
              width: `${(s.valor / total) * 100}%`,
              backgroundColor: s.color ?? ORD[Math.min(i, ORD.length - 1)],
            }}
            title={`${s.nombre}: ${money(s.valor)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {segmentos.map((s, i) => (
          <li key={s.nombre} className="flex items-center gap-2 text-[11.5px]">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: s.color ?? ORD[Math.min(i, ORD.length - 1)] }}
              aria-hidden
            />
            <span className="truncate text-muted">{s.nombre}</span>
            <span className="ml-auto shrink-0 font-medium text-fg tabular">{money(s.valor)}</span>
            <span className="w-11 shrink-0 text-right text-subtle tabular">
              {((s.valor / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
