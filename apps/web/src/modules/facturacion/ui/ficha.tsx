import { Check } from "lucide-react";
import { cn } from "@rodatech/ui";

import { PanelModulo } from "@/componentes/panel-modulo";

/**
 * Las piezas comunes de las FICHAS de documentos de Ventas: factura, nota y
 * guía (27/11).
 *
 * El supervisor de Luis vio las fichas «muy básicas, muy planas»: el número
 * en 20 px, el estado como una pastilla pequeña, el cliente en gris de 14 px
 * y el total metido en la tercera de cuatro tarjetas iguales. Todo pesaba lo
 * mismo, así que nada se leía primero.
 *
 * Aquí la jerarquía es la del patrón de ficha del rediseño: sobre el azul de
 * la marca, el número grande, el estado grande y con palabra, a quién va, y
 * la cifra que importa como héroe a la derecha. Debajo, el paso del flujo en
 * el que está el documento.
 *
 * Solo es la capa visual: cada ficha sigue leyendo lo mismo y pasando sus
 * botones tal cual; aquí solo se colocan.
 */

/* ------------------------------------------------------------- Cabecera */

export function CabeceraFicha({
  ruta,
  volver,
  tipo,
  numero,
  estados,
  quien,
  quienDetalle,
  junto,
  cifra,
  pasos,
  acciones,
}: {
  /** La ruta del módulo en el menú: da el tono y el icono del panel. */
  ruta: string;
  /** El botón de volver, ya armado. */
  volver: React.ReactNode;
  /** «Factura electrónica», «Guía de remisión»… */
  tipo: string;
  numero: string;
  /** Las pastillas de estado (`EstadoBadge size="md"`). */
  estados: React.ReactNode;
  /** El cliente o proveedor, en grande. */
  quien: string;
  /** Su RUC/DNI u otro dato corto. */
  quienDetalle?: string | null;
  /** Lo que va junto al nombre: «Ficha del cliente». */
  junto?: React.ReactNode;
  /** La cifra héroe de la derecha. */
  cifra?: { rotulo: string; valor: React.ReactNode; pie?: React.ReactNode };
  pasos?: React.ReactNode;
  /** Los botones de la ficha, en el orden en que se usan. */
  acciones?: React.ReactNode;
}) {
  return (
    <PanelModulo ruta={ruta}>
      <div className="@container relative flex flex-col gap-5">
        <div className="no-print">{volver}</div>

        <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{tipo}</p>
            {/* `break-all`: «F002-00000516» no tiene espacios, y a 390 px
                con la letra a 24 px no cabe en una línea. */}
            <h1 className="mt-1 break-all font-mono text-3xl font-extrabold tracking-tight text-white @md:text-4xl">
              {numero}
            </h1>
            <span
              className="anim-crecer mt-3 block h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400"
              aria-hidden="true"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">{estados}</div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 break-words text-xl font-bold text-white">
                {quien}
                {quienDetalle ? (
                  <span className="ml-2 text-base font-medium text-[var(--fg-muted)]">{quienDetalle}</span>
                ) : null}
              </p>
              {junto}
            </div>
          </div>

          {cifra ? (
            <div className="min-w-0 rounded-xl bg-white/[0.08] px-5 py-4 ring-1 ring-inset ring-white/15 @3xl:text-right">
              <p className="text-base font-semibold uppercase tracking-wide text-white">{cifra.rotulo}</p>
              <div className="tabular mt-1 break-words text-4xl font-extrabold leading-tight tracking-tight text-white @5xl:text-5xl">
                {cifra.valor}
              </div>
              {cifra.pie ? <div className="mt-1 text-base text-[var(--fg-muted)]">{cifra.pie}</div> : null}
            </div>
          ) : null}
        </div>

        {pasos}

        {acciones ? (
          <div className="no-print flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-4">
            {acciones}
          </div>
        ) : null}
      </div>
    </PanelModulo>
  );
}

/* ------------------------------------------------------------- El flujo */

export type PasoFlujo = "cotizacion" | "pedido" | "guia" | "factura" | "cobro";

const PASOS: { clave: PasoFlujo; etiqueta: string }[] = [
  { clave: "cotizacion", etiqueta: "Cotización" },
  { clave: "pedido", etiqueta: "Pedido" },
  { clave: "guia", etiqueta: "Guía" },
  { clave: "factura", etiqueta: "Factura" },
  { clave: "cobro", etiqueta: "Cobro" },
];

/**
 * Dónde está el documento en el camino de la venta (27/11).
 *
 * Cotización → Pedido → Guía → Factura → Cobro, con lo hecho marcado con su
 * visto, el paso de ahora en dorado con la palabra «Aquí», y lo que falta
 * con su número. El color no va solo: cada estado lleva forma y palabra,
 * porque Willy no distingue bien los tonos.
 *
 * `terminado` es para la factura ya cobrada: el último paso también está
 * hecho y no queda nada por delante.
 */
export function PasosDelFlujo({ actual, terminado = false }: { actual: PasoFlujo; terminado?: boolean }) {
  const iActual = PASOS.findIndex((p) => p.clave === actual);
  const pasoActual = PASOS[iActual];
  return (
    <nav aria-label="En qué paso de la venta está" className="@container rounded-xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/12">
      {/*
        En estrecho, los cinco nombres no caben debajo de sus círculos sin
        partirse por la mitad («Cotiza-ción»): ahí se dice el paso en una
        frase y los círculos quedan solos. Desde 32 rem de caja, cada uno con
        su nombre.
      */}
      <p className="mb-2 text-base font-semibold text-white @lg:hidden">
        {terminado
          ? "Venta completa: todos los pasos hechos."
          : `Paso ${iActual + 1} de ${PASOS.length}: ${pasoActual?.etiqueta ?? ""}`}
      </p>
      <ol className="grid grid-cols-5 gap-1">
        {PASOS.map((p, i) => {
          const hecho = i < iActual || (terminado && i === iActual);
          const ahora = i === iActual && !terminado;
          return (
            <li key={p.clave} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center">
              {/* La raya hasta el siguiente: hecha en dorado, por hacer tenue. */}
              {i < PASOS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-[1.125rem] h-0.5 w-full",
                    i < iActual ? "bg-accent-400" : "bg-white/20",
                  )}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full text-base font-bold",
                  hecho && "bg-accent-400 text-steel-950",
                  ahora && "bg-white text-brand-800 ring-4 ring-accent-400",
                  !hecho && !ahora && "bg-[var(--panel-2)] text-[var(--fg-muted)] ring-2 ring-inset ring-white/30",
                )}
              >
                {hecho ? <Check className="size-5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 text-sm leading-tight",
                  ahora ? "font-bold text-white" : hecho ? "font-semibold text-white" : "text-[var(--fg-muted)]",
                )}
              >
                <span className="sr-only @lg:not-sr-only">{p.etiqueta}</span>
                <span className="sr-only">{hecho ? " (hecho)" : ahora ? " (aquí)" : " (por hacer)"}</span>
              </span>
              {ahora ? (
                <span
                  className="hidden rounded-full bg-accent-400 px-2 text-sm font-bold text-steel-950 @lg:inline"
                  aria-hidden="true"
                >
                  Aquí
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ----------------------------------------------------- Bloques y datos */

/**
 * El título de una tarjeta, con su icono en chip (27/11). Va en un `div` y
 * no en un `header` a propósito: la regla de tokens.css pinta una raya azul
 * → dorada delante del primer `h2` de una tarjeta, y con el chip serían dos
 * marcas para lo mismo.
 */
export function TituloBloque({
  icono,
  children,
  extra,
  id,
}: {
  icono: React.ReactNode;
  children: React.ReactNode;
  /** Lo que va a la derecha del título: un contador, un botón. */
  extra?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 dark:bg-surface-3 dark:text-brand-300 dark:ring-[var(--border)] [&_svg]:size-5"
        >
          {icono}
        </span>
        <h2 id={id} className="min-w-0 text-xl font-bold text-[var(--titulo)]">
          {children}
        </h2>
      </div>
      {extra}
    </div>
  );
}

/**
 * Un dato de la ficha: el rótulo arriba, en `etiqueta-dato`, y el valor
 * debajo en semibold. Va en una rejilla que decide el ancho de la CAJA, no
 * de la pantalla (Luis, 29/10: «que se vean bien en móvil y tablet»): la
 * columna de la derecha es estrecha justo en tableta.
 */
export function DatoFicha({
  etiqueta,
  valor,
  ancho = false,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  /** Ocupa la fila entera: direcciones, listas de guías. */
  ancho?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", ancho && "@xs:col-span-2")}>
      <dt className="etiqueta-dato">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-base font-semibold text-[var(--fg)]">{valor}</dd>
    </div>
  );
}

/** La rejilla de `DatoFicha`: una columna en estrecho, dos desde 20 rem. */
export function RejillaDatos({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-1 gap-x-5 gap-y-4 @xs:grid-cols-2">{children}</dl>
    </div>
  );
}

/**
 * Un aviso con su icono y su palabra: «Anulada», «Borrador». El color no va
 * solo; el título lo dice.
 */
export function AvisoFicha({
  tono,
  icono,
  titulo,
  children,
}: {
  tono: "peligro" | "aviso" | "info" | "ok";
  icono: React.ReactNode;
  titulo: React.ReactNode;
  children?: React.ReactNode;
}) {
  const clases = {
    peligro: "border-[var(--danger)] bg-[var(--danger-bg)] [&_.aviso-icono]:text-[var(--danger)]",
    aviso: "border-[var(--warn)] bg-[var(--warn-bg)] [&_.aviso-icono]:text-[var(--warn)]",
    info: "border-[var(--info)] bg-[var(--info-bg)] [&_.aviso-icono]:text-[var(--info)]",
    ok: "border-[var(--ok)] bg-[var(--ok-bg)] [&_.aviso-icono]:text-[var(--ok)]",
  }[tono];
  return (
    <div className={cn("anim-entrada flex items-start gap-3 rounded-xl border border-l-4 p-4", clases)}>
      <span className="aviso-icono mt-0.5 shrink-0 [&_svg]:size-6" aria-hidden="true">
        {icono}
      </span>
      <div className="min-w-0 text-base">
        <p className="font-bold">{titulo}</p>
        {children ? <div className="mt-0.5">{children}</div> : null}
      </div>
    </div>
  );
}
