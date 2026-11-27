"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, CircleCheck, TriangleAlert } from "lucide-react";

import { COLOR_AGING, COLORES_FAMILIA, etiquetaAging } from "../dominio/periodo";
import type {
  FamiliaValorizada,
  MesVentas,
  ProductoVendido,
  PuntoCompras,
  PuntoVentas,
  TramoCartera,
} from "../dominio/tipos";
import {
  CajaGlobo,
  FilaGlobo,
  Globo,
  Leyenda,
  RADIO_ARRIBA,
  REJILLA,
  anchoTexto,
  cifraCorta,
  cifraEncima,
  dineroLargo,
  margenGrafico,
  propsEjeX,
  propsEjeY,
  useAncho,
  useLetraGrafico,
} from "./graficos-base";

/**
 * Los gráficos de los informes.
 *
 * Todos son componentes de cliente porque recharts mide el DOM para
 * dimensionarse. Los datos llegan YA calculados desde el servidor: aquí no se
 * suma ni se filtra nada, solo se pinta.
 *
 * Reglas que comparten:
 *
 *  · **Colores por token, no fijos.** Los tokens del tema cambian con él; un
 *    `#0e4c73` escrito a mano se queda oscuro sobre fondo oscuro. Y
 *    `--color-brand-600` es lo mismo con otro nombre: es de la paleta fija,
 *    no del tema. Las barras iban así y en oscuro daban 1,94:1 contra el
 *    fondo (21/10). Ahora es la rampa `--viz-ord-*`, que en claro da
 *    exactamente los mismos azules (ord-4 = brand-600, ord-3 = brand-500,
 *    ord-2 = brand-400) y en oscuro tiene sus propios pasos.
 *  · **La letra sale del `<html>`** (27/11, `graficos-base.tsx`): crece con el
 *    ajuste de `/accesibilidad`, con un suelo de 15 px. Antes era 14 fijo.
 *  · **La cifra escrita sobre la barra**, siempre que quepa: el globo solo
 *    sale al pasar el ratón, y en el teléfono casi nunca.
 *  · **Sin leyenda cuando hay una sola serie.** Una leyenda que dice «venta»
 *    encima de un gráfico titulado «Ventas» solo ocupa sitio.
 */

/**
 * La animación interna de recharts va APAGADA. A propósito.
 *
 * Con ella, los rectángulos de las barras se quedaban en el fotograma cero y
 * recharts no los dibujaba: el `<g class="recharts-bar-rectangle">` estaba
 * ahí, vacío, y el gráfico salía en blanco con los ejes puestos. Pasa cuando
 * el componente se vuelve a renderizar a mitad de la animación, que aquí es lo
 * normal — cada bloque llega por su propio `<Suspense>` y se hidrata cuando le
 * toca.
 *
 * Un gráfico que a veces sale vacío es mucho peor que uno que no crece: el
 * primero se lee como «no hay datos» y manda a alguien a buscar un problema
 * que no existe.
 *
 * La sensación de entrada la da igual el contenedor, que lleva `anim-entrada`
 * en CSS y no depende de que recharts termine nada.
 */
const ANIMAR = false;

/** La altura del dibujo crece con la letra: a 24 px, 260 px de alto se quedaban en ejes. */
const alto = (base: number, px: number) => Math.round(base * Math.max(1, px / 17));

/** Cada cuántas etiquetas del eje X se escribe una, para que no se monten. */
function saltoEje(etiquetas: string[], ancho: number, px: number): number {
  if (ancho <= 0 || etiquetas.length === 0) return 0;
  const mas = Math.max(...etiquetas.map((e) => anchoTexto(e, px)));
  return Math.max(0, Math.ceil((etiquetas.length * mas) / (ancho - px * 4.6)) - 1);
}

// ---------------------------------------------------------------------------
// Ventas mensuales
// ---------------------------------------------------------------------------

/**
 * La serie de ventas, con el margen encima.
 *
 * Área para la venta y línea para el margen, no dos áreas: son magnitudes de
 * escala muy distinta y superpuestas la pequeña desaparece. La línea se lee
 * como «cuánto de eso me queda».
 */
export function GraficoVentas({ datos }: { datos: MesVentas[] }) {
  const px = useLetraGrafico();
  return (
    <div>
      <ResponsiveContainer width="100%" height={alto(260, px)}>
        <AreaChart data={datos} margin={margenGrafico(px)}>
          <defs>
            <linearGradient id="rt-grad-venta" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-ord-3)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--viz-ord-3)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid {...REJILLA} />
          <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval="preserveStartEnd" minTickGap={px} />
          <YAxis {...propsEjeY(px)} />
          <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 2 }} />
          <Area
            type="monotone"
            dataKey="ventaNeta"
            name="Venta neta"
            stroke="var(--viz-ord-4)"
            strokeWidth={3}
            fill="url(#rt-grad-venta)"
            isAnimationActive={ANIMAR}
          />
          <Line
            type="monotone"
            dataKey="margen"
            name="Margen"
            stroke="var(--ok)"
            strokeWidth={3}
            dot={false}
            isAnimationActive={ANIMAR}
          />
        </AreaChart>
      </ResponsiveContainer>
      <Leyenda
        items={[
          { color: "var(--viz-ord-4)", texto: "Venta neta, sin IGV" },
          { color: "var(--ok)", texto: "Margen", forma: "linea" },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top de productos
// ---------------------------------------------------------------------------

/**
 * Ranking de productos, en barras HORIZONTALES.
 *
 * Vertical no vale: los códigos de rodamiento («6205-2RS1/C3») no caben
 * girados y acaban recortados o en diagonal, que es de lo más difícil de leer
 * que hay. La cifra va escrita al final de cada barra (27/11).
 */
export function GraficoTopProductos({ datos }: { datos: ProductoVendido[] }) {
  const px = useLetraGrafico();
  const fila = Math.round(px * 2.6);
  const altura = Math.max(200, datos.length * fila + 30);
  const anchoCodigo = Math.min(
    Math.round(px * 9),
    Math.max(...datos.map((d) => anchoTexto(d.codigo, px)), px * 4),
  );
  return (
    <div>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 4, right: Math.round(px * 5), left: 4, bottom: 0 }}
          barCategoryGap="22%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="codigo"
            width={anchoCodigo}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: px, fill: "var(--fg)", fontWeight: 700, fontFamily: "ui-monospace, monospace" }}
          />
          <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="venta" name="Vendido" radius={[0, 7, 7, 0]} isAnimationActive={ANIMAR}>
            <LabelList
              dataKey="venta"
              position="right"
              offset={8}
              fontSize={px}
              fontWeight={700}
              fill="var(--fg)"
              formatter={(v: unknown) => (typeof v === "number" ? cifraCorta(v) : "")}
            />
            {datos.map((p) => (
              // El color dice el margen, no el puesto: un producto que vende
              // mucho con margen bajo es el que hay que mirar, y en un ranking
              // monocromo se confunde con el que vende mucho y gana.
              <Cell
                key={p.id}
                fill={
                  p.margenPct >= 20
                    ? "var(--ok)"
                    : p.margenPct >= 10
                      ? "var(--viz-ord-3)"
                      : "var(--warn)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        items={[
          { color: "var(--ok)", texto: "Margen de 20 % o más" },
          { color: "var(--viz-ord-3)", texto: "Entre 10 y 20 %" },
          { color: "var(--warn)", texto: "Menos de 10 %" },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aging de cartera
// ---------------------------------------------------------------------------

/** Qué quiere decir cada tramo, en una palabra. El color solo no lo distingue todo el mundo. */
const URGENCIA_AGING: Record<string, { palabra: string; icono: typeof Clock }> = {
  sin_vencimiento: { palabra: "Sin fecha", icono: Clock },
  por_vencer: { palabra: "A tiempo", icono: CircleCheck },
  "1_30": { palabra: "Atrasado", icono: Clock },
  "31_60": { palabra: "Atrasado", icono: Clock },
  "61_90": { palabra: "Urgente", icono: TriangleAlert },
  mas_90: { palabra: "Urgente", icono: TriangleAlert },
};

/**
 * Cuánto se debe y desde cuándo, del verde al rojo.
 *
 * Rediseño del 27/11: eran columnas con el tramo debajo en letra de eje y,
 * aparte, la misma lista en letra pequeña. Para entenderlo había que cruzar
 * las dos. Ahora es UNA lista de barras horizontales: el tramo con su palabra
 * («A tiempo», «Atrasado», «Urgente») a la izquierda, la barra del color de su
 * urgencia y la cifra entera escrita al final. Se entiende sin leer el eje,
 * porque no hay eje.
 *
 * Es HTML y no recharts a propósito: crece con la letra del `<html>` sin
 * medir nada y no se rompe en el teléfono.
 */
export function GraficoAging({ datos }: { datos: TramoCartera[] }) {
  const total = datos.reduce((a, t) => a + Math.max(0, t.saldo), 0);
  const max = Math.max(0, ...datos.map((t) => t.saldo));
  return (
    <ul className="flex flex-col gap-3">
      {datos.map((t) => {
        const u = URGENCIA_AGING[t.tramo] ?? { palabra: "", icono: Clock };
        const Icono = u.icono;
        const color = COLOR_AGING[t.tramo] ?? "var(--fg-subtle)";
        const parte = total > 0 ? Math.round((Math.max(0, t.saldo) / total) * 100) : 0;
        return (
          <li key={t.tramo} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 text-base font-semibold text-[var(--fg)]">
                {etiquetaAging(t.tramo)}
                <span className="ml-2 text-sm font-normal text-[var(--fg-muted)]">
                  {t.documentos} {t.documentos === 1 ? "documento" : "documentos"}
                </span>
              </span>
              <span className="tabular text-lg font-bold">{dineroLargo(t.saldo)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden="true">
                <span
                  className="anim-crecer block h-full origin-left rounded-full"
                  style={{ width: `${max > 0 ? Math.max(2, (t.saldo / max) * 100) : 0}%`, background: color }}
                />
              </span>
              {u.palabra ? (
                <span
                  className="inline-flex w-28 shrink-0 items-center gap-1 text-sm font-bold"
                  style={{ color }}
                >
                  <Icono className="size-4 shrink-0" aria-hidden="true" />
                  {u.palabra}
                </span>
              ) : null}
              <span className="tabular w-12 shrink-0 text-right text-sm font-semibold text-[var(--fg-muted)]">
                {parte} %
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Valorización del inventario
// ---------------------------------------------------------------------------

/**
 * Reparto del capital inmovilizado, en anillo.
 *
 * Anillo y no tarta: el hueco del centro deja sitio para el total, que es el
 * número que de verdad se busca al abrir este gráfico.
 */
export function GraficoValorizacion({ datos }: { datos: FamiliaValorizada[] }) {
  const px = useLetraGrafico();
  const total = datos.reduce((a, f) => a + f.valorCosto, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={alto(250, px)}>
        <PieChart>
          <Pie
            data={datos}
            dataKey="valorCosto"
            nameKey="familia"
            innerRadius="62%"
            outerRadius="92%"
            // Con UNA sola porción el hueco entre porciones no separa nada: la
            // recorta y el anillo sale como una cuña suelta. Se ve en cuanto el
            // catálogo tiene una sola familia, que es hoy mismo.
            paddingAngle={datos.length > 1 ? 2 : 0}
            cornerRadius={datos.length > 1 ? 4 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={ANIMAR}
          >
            {datos.map((f, i) => (
              <Cell key={f.familia} fill={COLORES_FAMILIA[i % COLORES_FAMILIA.length]} />
            ))}
          </Pie>
          <Tooltip content={<Globo />} />
        </PieChart>
      </ResponsiveContainer>

      {/* El total va en el hueco: es el número que se busca al abrir esto. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center">
        <span className="text-sm font-semibold text-[var(--fg-muted)]">Todo, al costo</span>
        <span className="tabular break-words text-xl font-extrabold leading-tight text-[var(--titulo)]">
          {cifraCorta(total)}
        </span>
        <span className="text-sm text-[var(--fg-muted)]">dólares</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series por rango (26/08)
// ---------------------------------------------------------------------------

/**
 * Ventas del rango, con la granularidad que se haya elegido.
 *
 * Es el mismo dibujo que `GraficoVentas` pero sobre `PuntoVentas`, que no es
 * el mismo tipo: la serie mensual trae `ventaNeta` y la del rango trae `venta`.
 * Se dejan separados en vez de renombrar una de las dos, porque el nombre de
 * cada campo dice de dónde sale el número, y unificarlo obligaría a tocar el
 * tablero para arreglar los informes.
 */
export function GraficoSerieVentas({
  datos,
  mostrarMargen = true,
}: {
  datos: PuntoVentas[];
  /**
   * Sin costo, el margen de cada periodo es cero y la línea verde se quedaba
   * pegada al suelo: parecía que no se gana nada, cuando lo que pasa es que
   * no se sabe (revisión por módulos del 02/10). Entonces no se dibuja.
   */
  mostrarMargen?: boolean;
}) {
  const [ref, ancho] = useAncho();
  const px = useLetraGrafico();
  /*
    Barras hasta doce periodos, como el tablero (revisión del 02/10): un total
    por mes es una barra, y el área dibujaba una ola entre dos meses que no
    existe. El área queda para muchos periodos, donde sí hay recorrido.
  */
  const enBarras = datos.length <= 12;
  // Caben si la cifra más larga entra en su hueco (dos cifras por periodo con el margen).
  const mayor = anchoTexto(cifraCorta(Math.max(0, ...datos.map((d) => d.venta))), px);
  const caben =
    ancho > 0 && (ancho - px * 4.6) / Math.max(datos.length, 1) >= mayor * (mostrarMargen ? 2 : 1) + 8;
  const salto = saltoEje(datos.map((d) => d.etiqueta), ancho, px);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={alto(280, px)}>
        {enBarras ? (
          <BarChart data={datos} margin={margenGrafico(px)} barCategoryGap="18%" barGap={4}>
            <CartesianGrid {...REJILLA} />
            <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval={salto} />
            <YAxis {...propsEjeY(px)} />
            <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar
              dataKey="venta"
              name="Vendido"
              fill="var(--viz-ord-4)"
              radius={RADIO_ARRIBA}
              maxBarSize={80}
              isAnimationActive={ANIMAR}
            >
              {caben ? <LabelList dataKey="venta" content={cifraEncima(px)} /> : null}
            </Bar>
            {mostrarMargen ? (
              <Bar
                dataKey="margen"
                name="Margen"
                fill="var(--ok)"
                radius={RADIO_ARRIBA}
                maxBarSize={80}
                isAnimationActive={ANIMAR}
              >
                {caben ? <LabelList dataKey="margen" content={cifraEncima(px)} /> : null}
              </Bar>
            ) : null}
          </BarChart>
        ) : (
          <AreaChart data={datos} margin={margenGrafico(px)}>
            <defs>
              <linearGradient id="rt-grad-serie" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-ord-3)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--viz-ord-3)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid {...REJILLA} />
            <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval={salto} />
            <YAxis {...propsEjeY(px)} />
            <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 2 }} />
            <Area
              type="monotone"
              dataKey="venta"
              name="Vendido"
              stroke="var(--viz-ord-4)"
              strokeWidth={3}
              fill="url(#rt-grad-serie)"
              isAnimationActive={ANIMAR}
            />
            {mostrarMargen ? (
              <Line
                type="monotone"
                dataKey="margen"
                name="Margen"
                stroke="var(--ok)"
                strokeWidth={3}
                dot={false}
                isAnimationActive={ANIMAR}
              />
            ) : null}
          </AreaChart>
        )}
      </ResponsiveContainer>
      <Leyenda
        items={[
          { color: "var(--viz-ord-4)", texto: "Vendido, sin IGV" },
          ...(mostrarMargen
            ? [{ color: "var(--ok)", texto: "Lo que queda después del costo", forma: enBarras ? undefined : ("linea" as const) }]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * Costo de las órdenes de compra, en barras.
 *
 * Barras y no área a propósito: una compra es un hecho puntual —se firmó una
 * orden ese día— y no una magnitud que fluye. El área invita a leer la
 * pendiente entre dos puntos, y entre dos compras no hay pendiente que leer.
 *
 * Los gastos de importación van apilados encima del subtotal, porque son
 * costo igual y verlos aparte responde «¿cuánto de esto fue flete?».
 */
export function GraficoSerieCompras({ datos }: { datos: PuntoCompras[] }) {
  const [ref, ancho] = useAncho();
  const px = useLetraGrafico();
  const mayor = anchoTexto(cifraCorta(Math.max(0, ...datos.map((d) => d.costoTotal))), px);
  const caben = ancho > 0 && (ancho - px * 4.6) / Math.max(datos.length, 1) >= mayor + 8;
  const conGastos = datos.some((d) => d.gastos > 0);
  const salto = saltoEje(datos.map((d) => d.etiqueta), ancho, px);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={alto(280, px)}>
        <BarChart data={datos} margin={margenGrafico(px)} barCategoryGap="18%">
          <CartesianGrid {...REJILLA} />
          <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval={salto} />
          <YAxis {...propsEjeY(px)} />
          <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar
            dataKey="subtotal"
            name="Mercadería"
            stackId="costo"
            fill="var(--viz-ord-3)"
            radius={conGastos ? 0 : RADIO_ARRIBA}
            maxBarSize={80}
            isAnimationActive={ANIMAR}
          >
            {!conGastos && caben ? <LabelList dataKey="costoTotal" content={cifraEncima(px)} /> : null}
          </Bar>
          {conGastos ? (
            <Bar
              dataKey="gastos"
              name="Gastos de importación"
              stackId="costo"
              fill="var(--color-accent-400)"
              radius={RADIO_ARRIBA}
              maxBarSize={80}
              isAnimationActive={ANIMAR}
            >
              {/* La cifra es la del TOTAL de la columna, encima de la pila. */}
              {caben ? <LabelList dataKey="costoTotal" content={cifraEncima(px)} /> : null}
            </Bar>
          ) : null}
        </BarChart>
      </ResponsiveContainer>
      {/* Dos colores apilados sin leyenda no se pueden leer: no se sabía qué
          era lo amarillo (revisión por módulos del 02/10). */}
      <Leyenda
        items={[
          { color: "var(--viz-ord-3)", texto: "Mercadería" },
          ...(conGastos ? [{ color: "var(--color-accent-400)", texto: "Gastos de importación" }] : []),
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// La meta del mes
// ---------------------------------------------------------------------------

export interface PuntoMeta {
  etiqueta: string;
  /** Lo vendido (en el mes en curso, hasta hoy). */
  venta: number;
  /** Solo en el mes en curso: lo que le falta para llegar al ritmo de hoy. */
  resto: number;
  enCurso: boolean;
}

/**
 * Cada mes contra la meta y el tope (Luis, 20/10: *«gráficos que me digan cuál
 * es el tope que estoy vendiendo, cuánto debería vender, como si fuera mi
 * límite»*).
 *
 * Barras por mes; la **meta** —el promedio— en línea discontinua verde y el
 * **tope** —el mejor mes— en línea punteada gris. El mes en curso va más
 * claro, y encima, con borde discontinuo, lo que sumaría si sigue al mismo
 * ritmo: así se ve de un vistazo si llega a la línea.
 */
export function GraficoMeta({
  datos,
  meta,
  tope,
}: {
  datos: PuntoMeta[];
  meta: number;
  tope: number | null;
}) {
  const [ref, ancho] = useAncho();
  const px = useLetraGrafico();
  const mayor = anchoTexto(cifraCorta(Math.max(0, ...datos.map((d) => d.venta))), px);
  const caben = ancho > 0 && (ancho - px * 4.6) / Math.max(datos.length, 1) >= mayor + 6;
  // En el teléfono las líneas van sin su etiqueta: fuera se comían medio
  // gráfico y dentro caían sobre las barras. Lo dicen la leyenda y las cifras
  // de arriba.
  const estrecho = ancho > 0 && ancho < 640;
  const techo = Math.max(meta, tope ?? 0, ...datos.map((d) => d.venta + d.resto)) * 1.12;
  const salto = estrecho ? saltoEje(datos.map((d) => d.etiqueta), ancho, px) : 0;
  const CifraMes = cifraEncima(px);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={alto(310, px)}>
        <BarChart
          data={datos}
          margin={margenGrafico(px, estrecho ? 12 : Math.round(px * 6.4))}
          barCategoryGap="18%"
        >
          <CartesianGrid {...REJILLA} />
          <XAxis dataKey="etiqueta" {...propsEjeX(px)} interval={salto} />
          <YAxis {...propsEjeY(px)} domain={[0, Math.ceil(techo)]} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as PuntoMeta | undefined;
              if (!p) return null;
              return (
                <CajaGlobo titulo={`${label}${p.enCurso ? " · va a medias" : ""}`}>
                  <FilaGlobo color="var(--viz-ord-4)" nombre="Vendido" valor={dineroLargo(p.venta)} />
                  {p.enCurso ? (
                    <FilaGlobo
                      color="var(--viz-ord-3)"
                      nombre="A este ritmo cerraría en"
                      valor={dineroLargo(p.venta + p.resto)}
                    />
                  ) : null}
                  <p className={`mt-1 font-semibold ${p.venta >= meta ? "text-[var(--ok)]" : "text-[var(--fg-muted)]"}`}>
                    {p.venta >= meta ? "Pasó la meta" : `Faltó ${dineroLargo(meta - p.venta)} para la meta`}
                  </p>
                </CajaGlobo>
              );
            }}
            cursor={{ fill: "var(--surface-2)" }}
          />
          {/*
            Las líneas van ANTES que las barras, a propósito: Recharts pinta en
            el orden en que se escriben. Detrás, el halo de las cifras las
            tapa; delante, la meta tachaba «12 mil» y «11 mil» (visto en
            /reportes el 21/10, a 1568 px). Una cifra tachada no se lee.
          */}
          <ReferenceLine
            y={meta}
            stroke="var(--ok)"
            strokeWidth={3}
            strokeDasharray="10 5"
            label={
              estrecho
                ? undefined
                : { value: `Meta ${cifraCorta(meta)}`, position: "right", fill: "var(--ok)", fontSize: px, fontWeight: 700 }
            }
          />
          {tope !== null && tope > meta ? (
            <ReferenceLine
              y={tope}
              stroke="var(--fg-muted)"
              strokeWidth={3}
              strokeDasharray="2 5"
              label={
                estrecho
                  ? undefined
                  : { value: `Tope ${cifraCorta(tope)}`, position: "right", fill: "var(--fg-muted)", fontSize: px, fontWeight: 700 }
              }
            />
          ) : null}
          <Bar dataKey="venta" stackId="m" name="Vendido" maxBarSize={72} isAnimationActive={ANIMAR}>
            {datos.map((d) => (
              <Cell
                key={d.etiqueta}
                fill={d.enCurso ? "var(--viz-ord-2)" : "var(--viz-ord-4)"}
                radius={(d.resto > 0 ? [0, 0, 0, 0] : RADIO_ARRIBA) as unknown as number}
              />
            ))}
            {caben ? (
              <LabelList
                dataKey="venta"
                // El mes en curso sin cifra encima: ahí va el recuadro del ritmo,
                // y su cifra ya está en «Llevas vendido».
                //
                // Con halo del color del fondo, y dibujado a mano. Antes iba
                // como `stroke`/`style` sobre el LabelList y no llegaba al
                // <text>: visto el 21/10, aun con la meta ya detrás de las
                // barras, seguía tachando «12 mil» y «11 mil». Así, sí.
                content={(p) => {
                  const v = p.value;
                  if (typeof v !== "number" || v === 0 || datos.some((d) => d.enCurso && d.venta === v)) return null;
                  return <CifraMes x={p.x} y={p.y} width={p.width} value={v} />;
                }}
              />
            ) : null}
          </Bar>
          <Bar
            dataKey="resto"
            stackId="m"
            name="Si sigue a este ritmo"
            fill="transparent"
            stroke="var(--viz-ord-3)"
            strokeDasharray="5 3"
            strokeWidth={2}
            radius={RADIO_ARRIBA}
            maxBarSize={72}
            isAnimationActive={ANIMAR}
          />
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        items={[
          { color: "var(--viz-ord-4)", texto: "Vendido en el mes, sin IGV" },
          { color: "var(--viz-ord-2)", texto: "Este mes, hasta hoy" },
          { color: "var(--viz-ord-3)", texto: "Si sigue a este ritmo", forma: "contorno" },
          { color: "var(--ok)", texto: "Meta: tu promedio", forma: "discontinua" },
          ...(tope !== null && tope > meta
            ? [{ color: "var(--fg-muted)", texto: "Tope: tu mejor mes", forma: "discontinua" as const }]
            : []),
        ]}
      />
    </div>
  );
}
