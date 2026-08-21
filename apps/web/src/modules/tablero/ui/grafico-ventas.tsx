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

import type { MesVentas } from "../api/consultas";

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function etiquetaMes(iso: string): string {
  const [, mes] = iso.split("-");
  const i = Number(mes) - 1;
  return MESES[i] ?? iso;
}

const dolares = (n: number) =>
  n.toLocaleString("es-PE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function GraficoVentas({ meses }: { meses: MesVentas[] }) {
  const datos = meses.map((m) => ({
    mes: etiquetaMes(m.mes),
    venta: m.venta_neta,
    margen: m.margen,
  }));

  return (
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
            tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
            tickFormatter={(v: number) => dolares(v)}
          />
          <Tooltip
            formatter={(valor: number, nombre: string) => [
              dolares(valor),
              nombre === "venta" ? "Venta neta" : "Margen",
            ]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="venta"
            stroke="var(--viz-1)"
            strokeWidth={2}
            fill="url(#degradadoVenta)"
          />
          {/* El margen va como línea sobre el área: se compara contra la venta
              sin competir visualmente con ella. */}
          <Line
            type="monotone"
            dataKey="margen"
            stroke="var(--viz-3)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
