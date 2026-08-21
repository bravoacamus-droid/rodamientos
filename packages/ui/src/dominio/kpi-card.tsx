/*
 * KpiCard — SIN "use client".
 *
 * DECISIÓN QUE CONVIENE REVISAR: el sparkline es un `<svg>` dibujado a mano,
 * no un `<Sparkline>` de Recharts como el de la demo. Recharts obliga a
 * `"use client"` + `ResponsiveContainer` (que mide el DOM tras montar, con su
 * parpadeo) y pesa ~90 KB. Para un trazo de 12 puntos sin ejes, sin tooltip y
 * sin interacción, el SVG sale del servidor ya pintado y no manda nada al
 * navegador. Recharts sigue siendo la herramienta para los gráficos de
 * verdad (`charts/graficos.tsx`); aquí no hacía falta.
 *
 * La comparación contra el periodo anterior es obligatoria por diseño: un
 * número solo ("$ 84,300") no dice si el mes va bien. Y `mejorSi` existe
 * porque en cuentas por cobrar "subió un 12 %" es una mala noticia: el color
 * lo decide el negocio, no el signo.
 */
import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { formatearPorcentaje, variacionPorcentual } from "../lib/formato";
import { cn } from "../lib/utils";

export interface KpiCardProps {
  etiqueta: string;
  /** Ya formateado (usa `<Moneda>` o `formatearMonedaCorta`). */
  valor: React.ReactNode;
  /** Contexto bajo el valor: "12 documentos", "sobre 2.014 SKU". */
  detalle?: string;
  /** Valor numérico actual, para calcular la variación. */
  actual?: number;
  /** Mismo indicador en el periodo anterior. */
  previo?: number;
  /** Cómo se llama el periodo de comparación: "vs. mes anterior". */
  etiquetaComparacion?: string;
  /** `sube` para ventas y margen; `baja` para morosidad, días de cobro, roturas. */
  mejorSi?: "sube" | "baja";
  /** Serie para el sparkline, del más antiguo al más reciente. */
  serie?: readonly number[];
  /** Color del trazo. Por defecto el azul de datos. */
  colorSerie?: string;
  icono?: React.ReactNode;
  /** Envuelve la tarjeta en un enlace al listado filtrado. */
  href?: string;
  className?: string;
}

/* --------------------------------------------------------- Sparkline SVG --- */

/*
 * Sin `<linearGradient>` a propósito: un degradado SVG necesita un `id` único
 * por instancia, y `useId()` no está disponible en un Server Component. Un
 * relleno plano al 14 % da el mismo efecto de "masa bajo la línea" sin id, sin
 * hook y sin riesgo de colisión cuando hay cuatro KPI en la misma fila.
 */
function Sparkline({ serie, color }: { serie: readonly number[]; color: string }) {
  const puntos = serie.filter((n) => Number.isFinite(n));
  if (puntos.length < 2) return null;

  const ANCHO = 100;
  const ALTO = 28;
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  // Rango cero (serie plana): se traza por el medio en vez de dividir por cero.
  const rango = max - min || 1;
  const paso = ANCHO / (puntos.length - 1);

  const coords = puntos.map((v, i) => {
    const x = i * paso;
    const y = max === min ? ALTO / 2 : ALTO - ((v - min) / rango) * (ALTO - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linea = `M ${coords.join(" L ")}`;
  const area = `${linea} L ${ANCHO},${ALTO} L 0,${ALTO} Z`;
  const ultimo = coords[coords.length - 1]?.split(",") ?? [];

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      // Decorativo: la cifra y la variación ya dan el dato. El trazo solo
      // aporta la forma de la tendencia.
      aria-hidden="true"
      focusable="false"
    >
      <path d={area} fill={color} fillOpacity="0.14" />
      <path
        d={linea}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {ultimo[0] && ultimo[1] && <circle cx={ultimo[0]} cy={ultimo[1]} r="1.8" fill={color} />}
    </svg>
  );
}

/* ------------------------------------------------------------------ Card --- */

export function KpiCard({
  etiqueta,
  valor,
  detalle,
  actual,
  previo,
  etiquetaComparacion = "vs. periodo anterior",
  mejorSi = "sube",
  serie,
  colorSerie = "var(--viz-1)",
  icono,
  href,
  className,
}: KpiCardProps) {
  const variacion =
    actual !== undefined && previo !== undefined ? variacionPorcentual(actual, previo) : null;

  const sube = variacion !== null && variacion > 0.05;
  const baja = variacion !== null && variacion < -0.05;
  const esBueno = mejorSi === "sube" ? sube : baja;
  const esMalo = mejorSi === "sube" ? baja : sube;

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{etiqueta}</p>
        {icono && <span className="shrink-0 text-subtle [&_svg]:size-4">{icono}</span>}
      </div>

      <p className="tabular mt-1.5 text-2xl font-semibold leading-none text-fg">{valor}</p>
      {detalle && <p className="mt-1.5 text-[11px] text-muted">{detalle}</p>}

      {variacion !== null && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-[11px] font-medium",
            esBueno && "text-ok",
            esMalo && "text-danger",
            !esBueno && !esMalo && "text-muted",
          )}
        >
          {sube ? (
            <TrendingUp className="size-3.5" aria-hidden="true" />
          ) : baja ? (
            <TrendingDown className="size-3.5" aria-hidden="true" />
          ) : (
            <Minus className="size-3.5" aria-hidden="true" />
          )}
          <span className="tabular">
            {variacion > 0 ? "+" : ""}
            {formatearPorcentaje(variacion, 1)}
          </span>
          <span className="font-normal text-subtle">{etiquetaComparacion}</span>
        </p>
      )}

      {/* Sin base de comparación no se inventa un porcentaje: se dice. */}
      {variacion === null && actual !== undefined && previo !== undefined && (
        <p className="mt-2 text-[11px] text-subtle">Sin periodo anterior con el que comparar</p>
      )}

      {serie && serie.length > 1 && (
        <div className="-mx-1 mt-3">
          <Sparkline serie={serie} color={colorSerie} />
        </div>
      )}
    </>
  );

  const clases = cn(
    "card elev-1 block p-4",
    href && "transition-[box-shadow,border-color] hover:elev-2 hover:border-brand-200",
    className,
  );

  if (href) {
    return (
      <a href={href} className={clases}>
        {contenido}
      </a>
    );
  }
  return <div className={clases}>{contenido}</div>;
}
