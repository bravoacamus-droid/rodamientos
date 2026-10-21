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

import { COLOR_AGING, COLORES_FAMILIA, etiquetaAging } from "../dominio/periodo";
import type {
  FamiliaValorizada,
  MesVentas,
  ProductoVendido,
  PuntoCompras,
  PuntoVentas,
  TramoCartera,
} from "../dominio/tipos";

/**
 * Los gráficos de los informes.
 *
 * Todos son componentes de cliente porque recharts mide el DOM para
 * dimensionarse. Los datos llegan YA calculados desde el servidor: aquí no se
 * suma ni se filtra nada, solo se pinta.
 *
 * Tres reglas que comparten:
 *
 *  · **Colores por token, no fijos.** Los tokens del tema cambian con él; un
 *    `#0e4c73` escrito a mano se queda oscuro sobre fondo oscuro. Y
 *    `--color-brand-600` es lo mismo con otro nombre: es de la paleta fija,
 *    no del tema. Las barras iban así y en oscuro daban 1,94:1 contra el
 *    fondo (21/10). Ahora es la rampa `--viz-ord-*`, que en claro da
 *    exactamente los mismos azules (ord-4 = brand-600, ord-3 = brand-500,
 *    ord-2 = brand-400) y en oscuro tiene sus propios pasos.
 *  · **Sin leyenda cuando hay una sola serie.** Una leyenda que dice «venta»
 *    encima de un gráfico titulado «Ventas» solo ocupa sitio.
 *  · **Animación de entrada, pero una vez.** Recharts reanima en cada
 *    renderizado si no se le dice que no, y un gráfico que se redibuja al
 *    cambiar un filtro distrae en vez de informar.
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

/**
 * Formato corto para los ejes y las cifras sobre las barras: «12.4 mil».
 *
 * Era «12.4k»: la «k» es jerga de hoja de cálculo, y Willy lee «mil»
 * (revisión por módulos del 02/10). Sin decimales a partir de diez mil, que
 * «15.0 mil» no dice nada que no diga «15 mil».
 */
function corto(n: number): string {
  const abs = Math.abs(n);
  const fmt = (x: number) =>
    x.toLocaleString("es-PE", { maximumFractionDigits: Math.abs(x) >= 10 ? 0 : 1 });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} mill.`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} mil`;
  return String(Math.round(n));
}

/** Ancho real del gráfico, para decidir si caben las cifras sobre las barras. */
function useAncho() {
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

/*
  La cifra encima de cada barra. El globo solo sale al pasar el ratón, y en el
  teléfono casi nunca: con la cifra escrita, el gráfico se lee de un vistazo
  (revisión por módulos del 02/10). Solo se pone si cabe.
*/
const CIFRA = {
  position: "top" as const,
  offset: 6,
  fontSize: 14,
  fill: "var(--fg)",
  formatter: (v: unknown) => (typeof v === "number" && v !== 0 ? corto(v) : ""),
};

/** Leyenda propia, a 14 px: la de recharts sale a 12 y en su tipografía. */
function Leyenda({ items }: { items: { color: string; texto: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--fg-muted)]">
      {items.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[3px]"
            style={{ background: i.color }}
          />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

/*
  Los ejes, con sitio para su texto. Con `left: -18` y 52 px de ancho, «20.0k»
  a 14 px se cortaba en «0.0k» —el eje decía cero donde había veinte mil—
  (revisión por módulos del 02/10).
*/
const MARGEN_EJES = { top: 24, right: 12, left: 0, bottom: 0 };
const ANCHO_EJE_Y = 64;

const dinero = (n: number) =>
  `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Tooltip propio.
 *
 * El de recharts hereda estilos del navegador y en tema oscuro sale blanco
 * sobre blanco. Este usa los mismos tokens que el resto de la aplicación.
 */
function Globo({
  active,
  payload,
  label,
  formato = dinero,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  formato?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm elev-2">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: p.color }}
            aria-hidden="true"
          />
          <span className="text-[var(--fg-muted)]">{p.name}</span>
          <span className="tabular ml-auto font-medium">{formato(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

const EJE = {
  stroke: "var(--fg-muted)",
  fontSize: 14,
  tickLine: false,
  axisLine: false,
} as const;

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
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="rt-grad-venta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-ord-3)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--viz-ord-3)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={52} />
        <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)" }} />
        <Area
          type="monotone"
          dataKey="ventaNeta"
          name="Venta neta"
          stroke="var(--viz-ord-4)"
          strokeWidth={2}
          fill="url(#rt-grad-venta)"
          isAnimationActive={ANIMAR}
        />
        <Line
          type="monotone"
          dataKey="margen"
          name="Margen"
          stroke="var(--ok)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={ANIMAR}
        />
      </AreaChart>
    </ResponsiveContainer>
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
 * que hay.
 */
export function GraficoTopProductos({ datos }: { datos: ProductoVendido[] }) {
  const altura = Math.max(200, datos.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
        <XAxis type="number" tickFormatter={corto} {...EJE} />
        <YAxis
          type="category"
          dataKey="codigo"
          width={110}
          {...EJE}
          tick={{ fontSize: 14, fill: "var(--fg-muted)", fontFamily: "ui-monospace, monospace" }}
        />
        <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar
          dataKey="venta"
          name="Vendido"
          radius={[0, 4, 4, 0]}
          isAnimationActive={ANIMAR}
        >
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
  );
}

// ---------------------------------------------------------------------------
// Aging de cartera
// ---------------------------------------------------------------------------

/** Cuánto se debe y desde cuándo, del verde al rojo. */
export function GraficoAging({ datos }: { datos: TramoCartera[] }) {
  const conEtiqueta = datos.map((t) => ({ ...t, nombre: etiquetaAging(t.tramo) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={conEtiqueta} margin={MARGEN_EJES}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="nombre" {...EJE} />
        <YAxis tickFormatter={corto} {...EJE} width={ANCHO_EJE_Y} />
        <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="saldo" name="Saldo" radius={[4, 4, 0, 0]} isAnimationActive={ANIMAR}>
          <LabelList dataKey="saldo" {...CIFRA} />
          {conEtiqueta.map((t) => (
            <Cell key={t.tramo} fill={COLOR_AGING[t.tramo] ?? "var(--fg-subtle)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
  const total = datos.reduce((a, f) => a + f.valorCosto, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={datos}
            dataKey="valorCosto"
            nameKey="familia"
            innerRadius="58%"
            outerRadius="86%"
            // Con UNA sola porción el hueco entre porciones no separa nada: la
            // recorta y el anillo sale como una cuña suelta. Se ve en cuanto el
            // catálogo tiene una sola familia, que es hoy mismo.
            paddingAngle={datos.length > 1 ? 2 : 0}
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
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm text-[var(--fg-muted)]">A costo</span>
        <span className="tabular text-lg font-semibold">{dinero(total)}</span>
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
  /*
    Barras hasta doce periodos, como el tablero (revisión del 02/10): un total
    por mes es una barra, y el área dibujaba una ola entre dos meses que no
    existe. El área queda para muchos periodos, donde sí hay recorrido.
  */
  const enBarras = datos.length <= 12;
  const caben =
    ancho > 0 && ancho / Math.max(datos.length, 1) >= (mostrarMargen ? 130 : 72);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={260}>
        {enBarras ? (
          <BarChart data={datos} margin={MARGEN_EJES}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="etiqueta" {...EJE} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickFormatter={corto} {...EJE} width={ANCHO_EJE_Y} />
            <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar
              dataKey="venta"
              name="Venta neta"
              fill="var(--viz-ord-4)"
              radius={[4, 4, 0, 0]}
              maxBarSize={72}
              isAnimationActive={ANIMAR}
            >
              {caben ? <LabelList dataKey="venta" {...CIFRA} /> : null}
            </Bar>
            {mostrarMargen ? (
              <Bar
                dataKey="margen"
                name="Margen"
                fill="var(--ok)"
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
                isAnimationActive={ANIMAR}
              >
                {caben ? <LabelList dataKey="margen" {...CIFRA} /> : null}
              </Bar>
            ) : null}
          </BarChart>
        ) : (
          <AreaChart data={datos} margin={MARGEN_EJES}>
            <defs>
              <linearGradient id="rt-grad-serie" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-ord-3)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--viz-ord-3)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="etiqueta" {...EJE} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickFormatter={corto} {...EJE} width={ANCHO_EJE_Y} />
            <Tooltip content={<Globo />} cursor={{ stroke: "var(--border-strong)" }} />
            <Area
              type="monotone"
              dataKey="venta"
              name="Venta neta"
              stroke="var(--viz-ord-4)"
              strokeWidth={2}
              fill="url(#rt-grad-serie)"
              isAnimationActive={ANIMAR}
            />
            {mostrarMargen ? (
              <Line
                type="monotone"
                dataKey="margen"
                name="Margen"
                stroke="var(--ok)"
                strokeWidth={2}
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
          ...(mostrarMargen ? [{ color: "var(--ok)", texto: "Margen" }] : []),
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
  const caben = ancho > 0 && ancho / Math.max(datos.length, 1) >= 72;
  const conGastos = datos.some((d) => d.gastos > 0);

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={MARGEN_EJES}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
          <XAxis dataKey="etiqueta" {...EJE} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickFormatter={corto} {...EJE} width={ANCHO_EJE_Y} />
          <Tooltip content={<Globo />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar
            dataKey="subtotal"
            name="Mercadería"
            stackId="costo"
            fill="var(--viz-ord-3)"
            maxBarSize={72}
            isAnimationActive={ANIMAR}
          />
          <Bar
            dataKey="gastos"
            name="Gastos de importación"
            stackId="costo"
            fill="var(--color-accent-400)"
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
            isAnimationActive={ANIMAR}
          >
            {/* La cifra es la del TOTAL de la columna, encima de la pila. */}
            {caben ? <LabelList dataKey="costoTotal" {...CIFRA} /> : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Dos colores apilados sin leyenda no se pueden leer: no se sabía qué
          era lo amarillo (revisión por módulos del 02/10). */}
      <Leyenda
        items={[
          { color: "var(--viz-ord-3)", texto: "Mercadería" },
          ...(conGastos
            ? [{ color: "var(--color-accent-400)", texto: "Gastos de importación" }]
            : []),
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
  const caben = ancho > 0 && ancho / Math.max(datos.length, 1) >= 64;
  // En el teléfono las líneas van sin su etiqueta: fuera se comían medio
  // gráfico y dentro caían sobre las barras. Lo dicen la leyenda y las cifras
  // de arriba.
  const estrecho = ancho > 0 && ancho < 640;
  const techo = Math.max(meta, tope ?? 0, ...datos.map((d) => d.venta + d.resto)) * 1.12;

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={datos} margin={{ ...MARGEN_EJES, right: estrecho ? 12 : 104 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
          <XAxis dataKey="etiqueta" {...EJE} interval={estrecho ? "preserveStartEnd" : 0} minTickGap={8} />
          <YAxis tickFormatter={corto} {...EJE} width={ANCHO_EJE_Y} domain={[0, Math.ceil(techo)]} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as PuntoMeta | undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm elev-2">
                  <p className="mb-1 font-medium">{label}{p.enCurso ? " · va a medias" : ""}</p>
                  <p>Vendido: <span className="tabular font-medium">{dinero(p.venta)}</span></p>
                  {p.enCurso ? (
                    <p>A este ritmo cerraría en: <span className="tabular font-medium">{dinero(p.venta + p.resto)}</span></p>
                  ) : null}
                  <p className="text-[var(--fg-muted)]">
                    {p.venta >= meta ? "Pasó la meta" : `Faltó ${dinero(meta - p.venta)} para la meta`}
                  </p>
                </div>
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
            strokeWidth={2}
            strokeDasharray="8 4"
            label={estrecho ? undefined : { value: `Meta ${corto(meta)}`, position: "right", fill: "var(--ok)", fontSize: 14, fontWeight: 600 }}
          />
          {tope !== null && tope > meta ? (
            <ReferenceLine
              y={tope}
              stroke="var(--fg-muted)"
              strokeWidth={2}
              strokeDasharray="2 4"
              label={estrecho ? undefined : { value: `Tope ${corto(tope)}`, position: "right", fill: "var(--fg-muted)", fontSize: 14, fontWeight: 600 }}
            />
          ) : null}
          <Bar dataKey="venta" stackId="m" name="Vendido" maxBarSize={64} isAnimationActive={ANIMAR}>
            {datos.map((d) => (
              <Cell
                key={d.etiqueta}
                fill={d.enCurso ? "var(--viz-ord-2)" : "var(--viz-ord-4)"}
                radius={(d.resto > 0 ? [0, 0, 0, 0] : [4, 4, 0, 0]) as unknown as number}
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
                  const x = Number(p.x ?? 0) + Number(p.width ?? 0) / 2;
                  const y = Number(p.y ?? 0) - 6;
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      fontSize={14}
                      fill="var(--fg)"
                      stroke="var(--surface)"
                      strokeWidth={4}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {corto(v)}
                    </text>
                  );
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
            strokeDasharray="4 3"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={ANIMAR}
          />
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        items={[
          { color: "var(--viz-ord-4)", texto: "Vendido en el mes, sin IGV" },
          { color: "var(--viz-ord-2)", texto: "Este mes, hasta hoy" },
          { color: "var(--ok)", texto: "Meta: tu promedio" },
          ...(tope !== null && tope > meta ? [{ color: "var(--fg-muted)", texto: "Tope: tu mejor mes" }] : []),
        ]}
      />
    </div>
  );
}
