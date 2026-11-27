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
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

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
  /**
   * `sube` para ventas y margen; `baja` para morosidad, días de cobro,
   * roturas; `ninguno` cuando no es ni bueno ni malo (lo comprado). Existe
   * porque `mejorSi={undefined}` caía en el valor por defecto y pintaba de
   * rojo una compra menor (27/11).
   */
  mejorSi?: "sube" | "baja" | "ninguno";
  /** Serie para el sparkline, del más antiguo al más reciente. */
  serie?: readonly number[];
  /** Color del trazo. Por defecto el azul de datos. */
  colorSerie?: string;
  icono?: React.ReactNode;
  /** Envuelve la tarjeta en un enlace al listado filtrado. */
  href?: string;
  /** Texto del botón visible cuando hay `href`: «Ver comprobantes». */
  textoEnlace?: string;
  /**
   * Qué SIGNIFICA la cifra, no qué color queda bonito (27/11): `entra` para
   * el dinero que llega (vendido, margen), `sale` para el que se va o está
   * parado (comprado, capital en almacén), `revisar` para un dato que no
   * cuadra. Sin tono, el azul de marca. Pinta el filo izquierdo y el icono.
   */
  tono?: "marca" | "entra" | "sale" | "revisar";
  /**
   * El indicador del periodo anterior, ya formateado («$ 15,400»). Con él la
   * tarjeta dibuja dos barras con su cifra —ahora y antes— en lugar del
   * trazo pequeño, y dice la diferencia en palabras (27/11, ver `Comparacion`).
   */
  valorPrevio?: React.ReactNode;
  /** Rótulo de la barra de antes: «Periodo anterior», «Ayer». */
  etiquetaPrevio?: string;
  /** Cómo termina la frase: «41 % menos que {anterior}». */
  anterior?: string;
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

/* ----------------------------------------------------------- Comparación --- */

/*
 * Dos barras con su cifra, en vez del trazo (27/11, «esos gráficos también
 * pueden estar mejor, todo pensado en Willy»).
 *
 * El trazo de 28 px no tenía escala, ni fechas, ni cifras: con datos por día
 * salía una fila de picos de la que no se podía sacar nada. La pregunta que
 * Willy le hace a una tarjeta es una sola —¿voy mejor o peor que antes?— y
 * dos barras puestas una encima de otra la contestan sin leer: la larga es
 * la mayor. Las cifras van al lado, para el que sí quiere leer.
 *
 * Y la diferencia en palabras: «−41.3 % vs. el periodo anterior» pide saber
 * qué es «vs.» y leer un signo de 14 px; «41 % menos que el periodo
 * anterior», no.
 */

const TONO_BARRA: Record<NonNullable<KpiCardProps["tono"]>, string> = {
  marca: "bg-brand-500",
  entra: "bg-[var(--ok)]",
  sale: "bg-[var(--info)]",
  revisar: "bg-[var(--warn)]",
};

function Comparacion({
  actual,
  previo,
  valor,
  valorPrevio,
  etiquetaPrevio,
  anterior,
  variacion,
  esBueno,
  esMalo,
  tono,
}: {
  actual: number;
  previo: number;
  valor: React.ReactNode;
  valorPrevio: React.ReactNode;
  etiquetaPrevio: string;
  anterior: string;
  variacion: number | null;
  esBueno: boolean;
  esMalo: boolean;
  tono: NonNullable<KpiCardProps["tono"]>;
}) {
  const tope = Math.max(actual, previo, 0);
  // Una barra en cero se queda en un punto: que se vea que existe y vale nada.
  const ancho = (n: number) => (tope > 0 ? Math.max((Math.max(n, 0) / tope) * 100, 1.5) : 1.5);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Barra rotulo="Ahora" cifra={valor} ancho={ancho(actual)} clase={TONO_BARRA[tono]} />
      <Barra rotulo={etiquetaPrevio} cifra={valorPrevio} ancho={ancho(previo)} clase="bg-[var(--border-strong)]" tenue />

      {variacion !== null ? (
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset",
            esBueno && "bg-ok-bg text-ok ring-[var(--ok)]/25",
            esMalo && "bg-danger-bg text-danger ring-[var(--danger)]/25",
            !esBueno && !esMalo && "bg-[var(--surface-2)] text-fg ring-[var(--border)]",
          )}
        >
          {variacion > 0.05 ? (
            <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
          ) : variacion < -0.05 ? (
            <TrendingDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Minus className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {Math.abs(variacion) < 0.5
              ? `Igual que ${anterior}`
              : `${formatearPorcentaje(Math.abs(variacion), 0)} ${variacion > 0 ? "más" : "menos"} que ${anterior}`}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">Sin datos para comparar con {anterior}</p>
      )}
    </div>
  );
}

function Barra({
  rotulo,
  cifra,
  ancho,
  clase,
  tenue = false,
}: {
  rotulo: string;
  cifra: React.ReactNode;
  ancho: number;
  clase: string;
  tenue?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={cn("font-semibold", tenue ? "text-muted" : "text-fg")}>{rotulo}</span>
        <span className={cn("tabular font-bold", tenue ? "text-muted" : "text-fg")}>{cifra}</span>
      </div>
      {/* El carril de fondo da la escala: sin él, una barra corta sola no
          dice si es corta. */}
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden="true">
        <div className={cn("anim-crecer h-full origin-left rounded-full", clase)} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Card --- */

/* El color lleva significado y solo en dos sitios: el filo y el icono. La
   cifra sigue en el azul de los títulos, que es el que mejor se lee. */
const TONO_FILO: Record<NonNullable<KpiCardProps["tono"]>, string> = {
  marca: "border-l-brand-500",
  entra: "border-l-[var(--ok)]",
  sale: "border-l-[var(--info)]",
  revisar: "border-l-[var(--warn)]",
};

const TONO_ICONO: Record<NonNullable<KpiCardProps["tono"]>, string> = {
  marca: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-surface-3 dark:text-brand-300 dark:ring-[var(--border)]",
  entra: "bg-ok-bg text-ok ring-[var(--ok)]/20",
  sale: "bg-info-bg text-info ring-[var(--info)]/20",
  revisar: "bg-warn-bg text-warn ring-[var(--warn)]/25",
};

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
  textoEnlace = "Ver detalle",
  tono = "marca",
  valorPrevio,
  etiquetaPrevio = "Periodo anterior",
  anterior = "el periodo anterior",
  className,
}: KpiCardProps) {
  const variacion =
    actual !== undefined && previo !== undefined ? variacionPorcentual(actual, previo) : null;

  const sube = variacion !== null && variacion > 0.05;
  const baja = variacion !== null && variacion < -0.05;
  const esBueno = mejorSi === "sube" ? sube : mejorSi === "baja" && baja;
  const esMalo = mejorSi === "sube" ? baja : mejorSi === "baja" && sube;

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold text-fg">{etiqueta}</p>
        {icono && (
          // En su propia caja con fondo: un icono suelto en gris al lado de un
          // título se lee como decoración. Con superficie propia se lee como
          // la marca de qué mide esta tarjeta, que es lo que es.
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset [&_svg]:size-6",
              TONO_ICONO[tono],
            )}
          >
            {icono}
          </span>
        )}
      </div>

      {/* Sin `truncate`: con la letra al 150 % una cifra cortada es una
          cifra que no existe. Si no cabe, baja de línea. */}
      <p className="tabular mt-1 break-words text-3xl font-extrabold leading-tight tracking-tight text-[var(--titulo)]">
        {valor}
      </p>
      {detalle && <p className="mt-1 text-sm text-muted">{detalle}</p>}

      {valorPrevio !== undefined && actual !== undefined && previo !== undefined ? (
        <Comparacion
          actual={actual}
          previo={previo}
          valor={valor}
          valorPrevio={valorPrevio}
          etiquetaPrevio={etiquetaPrevio}
          anterior={anterior}
          variacion={variacion}
          esBueno={esBueno}
          esMalo={esMalo}
          tono={tono}
        />
      ) : null}

      {valorPrevio === undefined && variacion !== null && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-sm font-medium",
            esBueno && "text-ok",
            esMalo && "text-danger",
            !esBueno && !esMalo && "text-muted",
          )}
        >
          {sube ? (
            <TrendingUp className="size-4" aria-hidden="true" />
          ) : baja ? (
            <TrendingDown className="size-4" aria-hidden="true" />
          ) : (
            <Minus className="size-4" aria-hidden="true" />
          )}
          <span className="tabular">
            {variacion > 0 ? "+" : ""}
            {formatearPorcentaje(variacion, 1)}
          </span>
          <span className="font-normal text-subtle">{etiquetaComparacion}</span>
        </p>
      )}

      {/* Sin base de comparación no se inventa un porcentaje: se dice. */}
      {valorPrevio === undefined && variacion === null && actual !== undefined && previo !== undefined && (
        <p className="mt-2 text-sm text-subtle">Sin periodo anterior con el que comparar</p>
      )}

      {valorPrevio === undefined && serie && serie.length > 1 && (
        <div className="-mx-1 mt-3">
          <Sparkline serie={serie} color={colorSerie} />
        </div>
      )}

      {/* Que toda la tarjeta sea pulsable no se ve. Luis: «una persona que no
          sabe que tiene que darle click ahí». El botón dice que se puede. */}
      {/* `mt-auto` lo baja al fondo en una fila de alturas iguales; el
          `pt-3` le deja aire en la tarjeta más alta, donde mt-auto vale 0. */}
      {href && (
        <span className="mt-auto pt-3">
          <span className="boton-fila">
            {textoEnlace}
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </span>
      )}
    </>
  );

  const clases = cn(
    "card elev-1 anim-escalon relative flex flex-col overflow-hidden border-l-4 p-4",
    TONO_FILO[tono],
    href && "transition-[box-shadow,border-color] hover:elev-2",
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
