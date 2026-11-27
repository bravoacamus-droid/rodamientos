"use client";

import * as React from "react";

/**
 * Lo que comparten TODOS los gráficos del ERP (27/11): informes, tablero y
 * tablero ejecutivo.
 *
 * Hasta hoy cada archivo llevaba su copia de la letra, el eje, la leyenda y el
 * globo, y las tres copias decían `fontSize: 14` a fuego. Eso tenía dos
 * problemas, y el segundo es el que importa:
 *
 *  · 14 px es menos que la letra del resto de la pantalla (17 px de base).
 *    Willy no ve bien: el número del eje era lo más pequeño de la página.
 *  · El SVG de recharts NO hereda el `rem`. Con el ajuste de letra de
 *    `/accesibilidad` todo el ERP crecía hasta 24 px… menos los gráficos,
 *    que se quedaban en 14. Justo lo que él más necesita leer grande.
 *
 * Ahora la letra del gráfico se LEE del `<html>` en el navegador y se usa tal
 * cual, con un suelo de 15 px. Cambia sola cuando cambia el ajuste.
 */

/** Por debajo de esto, nada en un gráfico (brief del rediseño, 27/11). */
export const LETRA_MINIMA = 15;

/** La base del ERP cuando todavía no hay navegador que medir. */
const LETRA_SERVIDOR = 17;

function leerLetra(): number {
  if (typeof window === "undefined") return LETRA_SERVIDOR;
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) ? Math.max(LETRA_MINIMA, Math.round(px)) : LETRA_SERVIDOR;
}

/*
  El ajuste de letra pone `data-letra` en el `<html>` (ver `lib/accesibilidad`),
  y el zoom del navegador cambia el tamaño sin tocar atributos: por eso se
  escuchan las dos cosas.
*/
function suscribir(avisar: () => void): () => void {
  const mo = new MutationObserver(avisar);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-letra", "style", "class"],
  });
  window.addEventListener("resize", avisar);
  return () => {
    mo.disconnect();
    window.removeEventListener("resize", avisar);
  };
}

/** El tamaño de letra, en px, que deben usar los ejes y las cifras. */
export function useLetraGrafico(): number {
  return React.useSyncExternalStore(suscribir, leerLetra, () => LETRA_SERVIDOR);
}

/** Ancho real del gráfico, para decidir si caben las cifras escritas. */
export function useAncho() {
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

/**
 * Lo que ocupa un texto a esa letra, a ojo: 0,6 em por carácter en negrita
 * con cifras tabulares. Sirve para decidir si una cifra cabe sobre su barra;
 * equivocarse por arriba solo quita una etiqueta, no la monta sobre otra.
 */
export function anchoTexto(texto: string, px: number): number {
  return texto.length * px * 0.6 + px * 0.6;
}

/**
 * La cifra corta de ejes y etiquetas: «20 mil», «4.5 mil», «1.2 mill.», «850».
 *
 * «mil» y no «k»: la «k» es jerga de hoja de cálculo (revisión del 02/10).
 */
export function cifraCorta(n: number): string {
  const abs = Math.abs(n);
  const fmt = (x: number) =>
    x.toLocaleString("es-PE", { maximumFractionDigits: Math.abs(x) >= 10 ? 0 : 1 });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} mill.`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} mil`;
  return Math.round(n).toLocaleString("es-PE");
}

/** «$ 12,480.50», con espacio que no se parte. */
export function dineroLargo(n: number): string {
  return `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/*
  Ejes limpios: sin rayitas, la línea de abajo apenas marcada y la rejilla en
  horizontal, fina y lisa. La rejilla discontinua de antes competía con las
  barras; lo que se lee aquí es la cifra escrita, no la cuadrícula.
*/
export function propsEjeX(px: number) {
  return {
    tickLine: false,
    axisLine: { stroke: "var(--viz-axis)" },
    tick: { fontSize: px, fill: "var(--viz-ink)", fontWeight: 600 },
    tickMargin: Math.round(px * 0.5),
  } as const;
}

export function propsEjeY(px: number) {
  return {
    tickLine: false,
    axisLine: false,
    tick: { fontSize: px, fill: "var(--viz-ink)" },
    // «12.5 mil» a la letra que toque, con su respiro: el eje ya se comió la
    // primera cifra una vez por quedarse corto (revisión del 02/10).
    width: Math.round(px * 4.6),
    tickFormatter: (v: number) => cifraCorta(v),
  } as const;
}

export const REJILLA = {
  stroke: "var(--viz-grid)",
  vertical: false,
} as const;

/** Margen de arriba: lo que ocupa la cifra escrita sobre la barra más alta. */
export function margenGrafico(px: number, derecha = 12) {
  return { top: Math.round(px * 1.9), right: derecha, left: 0, bottom: 4 };
}

/** Esquinas redondeadas arriba: la barra se ve como una pieza, no como un borde. */
export const RADIO_ARRIBA: [number, number, number, number] = [7, 7, 0, 0];

/**
 * La cifra escrita encima de la barra, dibujada a mano.
 *
 * La etiqueta de recharts ajusta el texto al ancho de la barra y partía
 * «11 mil» en dos líneas (06/10). Un `<text>` suelto no se parte. El halo del
 * color del fondo evita que una línea de meta o la barra vecina la tache
 * (visto el 21/10).
 */
export function cifraEncima(px: number, formato: (n: number) => string = cifraCorta, color = "var(--fg)") {
  function CifraEncima(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
    const v = typeof p.value === "number" ? p.value : Number(p.value);
    if (!Number.isFinite(v) || v === 0) return null;
    const x = Number(p.x ?? 0) + Number(p.width ?? 0) / 2;
    const y = Number(p.y ?? 0) - Math.round(px * 0.45);
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize={px}
        fontWeight={700}
        fill={color}
        stroke="var(--surface)"
        strokeWidth={4}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formato(v)}
      </text>
    );
  }
  return CifraEncima;
}

/**
 * Leyenda propia, con palabras y a la letra del texto.
 *
 * La de recharts sale a 12 px y en su tipografía. Esta va a `text-base` con
 * una muestra de 16 px; y una línea (la meta, el tope) se dibuja como línea,
 * no como cuadrado, para que se reconozca la del gráfico.
 */
export function Leyenda({
  items,
  className = "",
}: {
  items: { color: string; texto: string; forma?: "barra" | "linea" | "discontinua" | "contorno" }[];
  className?: string;
}) {
  return (
    <ul className={`${className || "mt-3"} flex flex-wrap items-center gap-x-6 gap-y-2 text-base font-medium text-[var(--fg)]`}>
      {items.map((i) => (
        <li key={i.texto} className="inline-flex items-center gap-2">
          {i.forma === "linea" || i.forma === "discontinua" ? (
            <span
              aria-hidden="true"
              className="inline-block w-7 border-t-[3px]"
              style={{ borderColor: i.color, borderStyle: i.forma === "discontinua" ? "dashed" : "solid" }}
            />
          ) : i.forma === "contorno" ? (
            <span
              aria-hidden="true"
              className="inline-block size-4 rounded-[4px] border-2 border-dashed"
              style={{ borderColor: i.color }}
            />
          ) : (
            <span aria-hidden="true" className="inline-block size-4 rounded-[4px]" style={{ background: i.color }} />
          )}
          {i.texto}
        </li>
      ))}
    </ul>
  );
}

/**
 * El globo al pasar el ratón: grande, con la letra del texto y los tokens del
 * tema (el de recharts sale blanco sobre blanco en oscuro).
 */
export function CajaGlobo({ titulo, children }: { titulo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-56 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-base elev-2">
      {titulo ? <p className="mb-1.5 text-lg font-bold text-[var(--titulo)]">{titulo}</p> : null}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export function FilaGlobo({ color, nombre, valor }: { color?: string; nombre: React.ReactNode; valor: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2">
      {color ? (
        <span className="size-3 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      ) : null}
      <span className="text-[var(--fg-muted)]">{nombre}</span>
      <span className="tabular ml-auto pl-4 font-bold">{valor}</span>
    </p>
  );
}

/** El globo de siempre: una fila por serie, con su cifra entera. */
export function Globo({
  active,
  payload,
  label,
  formato = dineroLargo,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: { fill?: string } }[];
  label?: string;
  formato?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <CajaGlobo titulo={label}>
      {payload.map((p, i) => (
        <FilaGlobo key={i} color={p.color ?? p.payload?.fill} nombre={p.name} valor={formato(p.value ?? 0)} />
      ))}
    </CajaGlobo>
  );
}
