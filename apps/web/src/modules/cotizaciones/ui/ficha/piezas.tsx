// Sin "use client": son cajas y texto, se pintan en el servidor.
import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@rodatech/ui";

/*
  Las piezas de una FICHA de ventas (27/11): cotización, pedido y cliente.

  Luis, 27/11: los supervisores veían el sistema «muy básico, muy plano,
  neutral». Las fichas eran lo más plano: el número en una pastilla gris de
  14 px, el cliente en negro y el total escondido al pie de la tabla. Willy
  tenía que bajar hasta el final para saber cuánto vale lo que está mirando.

  Estas piezas copian el lenguaje que ya se aprobó en el login y el tablero
  —el azul de la marca, el dorado como único acento, la barra inclinada— y no
  inventan otro. Viven aquí, en ventas, porque `componentes/` y `packages/ui`
  los estaba cambiando otro trabajo el mismo día; si se quieren para compras
  o almacén, se suben tal cual.
*/

/* ------------------------------------------------------------ Cabecera --- */

/**
 * La cabecera de una ficha: qué documento es, en qué estado, de quién y
 * cuánto vale.
 *
 * Va sobre `panel-modulo` —el mismo azul de las cabeceras de las listas—
 * porque ese panel REDEFINE los tokens en su interior: el `EstadoBadge`, los
 * botones `outline` y los textos `--fg-muted` que se pongan dentro se vuelven
 * vidrio sobre azul sin tocarlos, y en modo oscuro y contraste alto siguen
 * las reglas que ya tiene el panel.
 *
 * Lo que NO va dentro son las acciones del documento: tienen avisos en rojo,
 * candados y menús que se leen sobre blanco. Van justo debajo, en su propia
 * tarjeta (`BarraAcciones`).
 */
export function CabeceraFicha({
  icono: Icono,
  tipo,
  numero,
  estado,
  titulo,
  detalle,
  enlaces,
  cifra,
  pasos,
}: {
  icono: LucideIcon;
  /** «Cotización», «Pedido», «Cliente». */
  tipo: string;
  /** El número del documento, grande y en monoespaciada. */
  numero?: React.ReactNode;
  /** La pastilla del estado, ya montada. */
  estado?: React.ReactNode;
  /** Lo que se recuerda del documento: el cliente. */
  titulo: React.ReactNode;
  /** Una línea debajo: documento, fecha. */
  detalle?: React.ReactNode;
  /** Botones de ir a otra parte (ficha del cliente, la original…). */
  enlaces?: React.ReactNode;
  /** La cifra que manda, a la derecha: el total. */
  cifra?: { etiqueta: string; valor: React.ReactNode; detalle?: React.ReactNode } | null;
  /** El paso del flujo, debajo de todo. */
  pasos?: React.ReactNode;
}) {
  return (
    <section data-area="ventas" className="panel-modulo @container flex flex-col gap-5 p-5 sm:p-7">
      <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* El icono del módulo en dorado, como en el menú y en la lista:
                se reconoce de qué parte del negocio es sin leer nada. */}
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/12 text-accent-300 ring-1 ring-inset ring-white/20">
              <Icono className="size-6" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-[var(--fg-muted)]">{tipo}</span>
            {numero ? (
              <span className="font-mono text-2xl font-extrabold tracking-tight text-[var(--titulo)] sm:text-3xl">
                {numero}
              </span>
            ) : null}
            {estado}
          </div>

          {/* `break-words` y no `truncate`: la razón social es lo que se viene
              a leer, y a 24 px de letra cortarla sería esconderla. */}
          <h1 className="mt-3 break-words text-3xl font-bold tracking-tight text-[var(--titulo)] sm:text-4xl">
            {titulo}
          </h1>
          <span
            className="anim-crecer mt-3 block h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400"
            aria-hidden="true"
          />
          {detalle ? <div className="mt-3 text-lg text-[var(--fg-muted)]">{detalle}</div> : null}
          {enlaces ? <div className="mt-4 flex flex-wrap items-center gap-2">{enlaces}</div> : null}
        </div>

        {cifra ? (
          <div className="min-w-0 shrink-0 rounded-xl bg-white/[0.08] px-5 py-4 ring-1 ring-inset ring-white/15 @3xl:text-right">
            <p className="text-base font-semibold uppercase tracking-wide text-[var(--titulo)]">{cifra.etiqueta}</p>
            {/* Sin `truncate`: una cifra cortada es una cifra que no existe. */}
            <p className="tabular mt-1 break-words text-4xl font-extrabold leading-tight tracking-tight text-[var(--titulo)] @5xl:text-5xl">
              {cifra.valor}
            </p>
            {cifra.detalle ? <div className="mt-1 text-base text-[var(--fg-muted)]">{cifra.detalle}</div> : null}
          </div>
        ) : null}
      </div>
      {pasos}
    </section>
  );
}

/* --------------------------------------------------------------- Pasos --- */

export type EstadoPaso = "hecho" | "actual" | "falta";

/**
 * Por dónde va el documento: Cotización → Pedido → Guía → Factura → Cobro.
 *
 * Es el mismo orden del flujo (CLAUDE.md §6) y el que Willy ya sabe de
 * memoria; lo que no sabía era en cuál estaba ESTE documento sin leer cuatro
 * tarjetas. El color no es la única pista: lo hecho lleva un visto, el paso
 * actual va relleno y en negrita, y lo que falta va con borde y su número.
 */
export function PasosFlujo({ pasos }: { pasos: { nombre: string; estado: EstadoPaso }[] }) {
  return (
    <ol aria-label="En qué paso está" className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {pasos.map((p, i) => (
        <li key={p.nombre} className="flex items-center gap-1.5">
          <span
            aria-current={p.estado === "actual" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base",
              p.estado === "actual" && "bg-accent-400 font-bold text-steel-950",
              p.estado === "hecho" && "bg-white/12 font-semibold text-[var(--titulo)] ring-1 ring-inset ring-white/25",
              p.estado === "falta" && "font-medium text-[var(--fg-muted)] ring-1 ring-inset ring-white/30",
            )}
          >
            {p.estado === "hecho" ? (
              <Check className="size-5 text-accent-300" aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-sm font-bold",
                  p.estado === "actual" ? "bg-steel-950 text-accent-300" : "ring-1 ring-inset ring-white/40",
                )}
              >
                {i + 1}
              </span>
            )}
            {p.nombre}
            <span className="sr-only">
              {p.estado === "hecho" ? " (hecho)" : p.estado === "actual" ? " (aquí está)" : " (falta)"}
            </span>
          </span>
          {i < pasos.length - 1 ? (
            <ChevronRight className="size-5 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------ Barra de acciones */

/**
 * Lo que se puede hacer con el documento, justo debajo de la cabecera.
 *
 * `elev-2` porque es lo que pide acción (brief del 27/11: fondo < card <
 * lo que pide acción). A la izquierda, en una frase, qué toca ahora: el
 * botón principal cambia con el estado, y la frase dice por qué.
 */
export function BarraAcciones({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card elev-2 @container flex flex-col gap-4 border-l-4 border-l-brand-500 p-4 sm:p-5">
      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-center @4xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[var(--titulo)]">{titulo}</h2>
          {texto ? <p className="mt-0.5 text-base text-[var(--fg-muted)]">{texto}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Título de bloque */

export type Tono = "entra" | "sale" | "revisar" | "urgente" | "marca";

const CHIP: Record<Tono, string> = {
  marca: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-surface-3 dark:text-brand-300 dark:ring-[var(--border)]",
  entra: "bg-ok-bg text-ok ring-[var(--ok)]/20",
  sale: "bg-info-bg text-info ring-[var(--info)]/20",
  revisar: "bg-warn-bg text-warn ring-[var(--warn)]/25",
  urgente: "bg-danger-bg text-danger ring-[var(--danger)]/25",
};

/** El filo de la izquierda: el color dice QUÉ significa, no adorna. */
export const FILO: Record<Tono, string> = {
  marca: "border-l-brand-500",
  entra: "border-l-[var(--ok)]",
  sale: "border-l-[var(--info)]",
  revisar: "border-l-[var(--warn)]",
  urgente: "border-l-[var(--danger)]",
};

/** El icono en su caja, como en las tarjetas del tablero. */
export function ChipIcono({ icono: Icono, tono = "marca", chico = false }: { icono: LucideIcon; tono?: Tono; chico?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center ring-1 ring-inset",
        chico ? "size-10 rounded-lg" : "size-12 rounded-xl",
        CHIP[tono],
      )}
    >
      <Icono className={chico ? "size-5" : "size-6"} aria-hidden="true" />
    </span>
  );
}

/**
 * El título de una tarjeta de la ficha: icono en chip, título en grande y
 * una línea de ayuda. Va en un `<div>` y no en `<header>` a propósito: la
 * regla de tokens.css que pone la raya azul → dorado delante del primer `h2`
 * de una tarjeta mira `.card > header`, y con el chip al lado serían dos
 * marcas para lo mismo.
 */
export function TituloBloque({
  icono,
  tono = "marca",
  titulo,
  ayuda,
  accion,
  id,
}: {
  icono: LucideIcon;
  tono?: Tono;
  titulo: React.ReactNode;
  ayuda?: React.ReactNode;
  /** Un botón a la derecha del título. */
  accion?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <ChipIcono icono={icono} tono={tono} chico />
        <div className="min-w-0">
          <h2 id={id} className="text-xl font-bold text-[var(--titulo)]">
            {titulo}
          </h2>
          {ayuda ? <div className="mt-0.5 text-base text-[var(--fg-muted)]">{ayuda}</div> : null}
        </div>
      </div>
      {accion}
    </div>
  );
}

/* --------------------------------------------------------- Dato resumen --- */

/**
 * Una tarjeta de dato clave: rótulo, valor grande y qué quiere decir.
 *
 * Antes era un `card p-4` con el valor en `text-xl` y `truncate`: «A crédito
 * · 30 días» y «Sin orden» se cortaban a 24 px de letra. Ahora parte la
 * línea, y el filo de color dice si el dato está bien o pide algo.
 */
export function DatoResumen({
  icono,
  etiqueta,
  valor,
  detalle,
  tono = "marca",
  colorValor,
  accion,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: Tono;
  /** El valor en el color del tono (el margen en verde o en rojo). */
  colorValor?: boolean;
  accion?: React.ReactNode;
}) {
  const color = !colorValor
    ? "text-[var(--titulo)]"
    : tono === "entra"
      ? "text-[var(--ok)]"
      : tono === "urgente"
        ? "text-[var(--danger)]"
        : tono === "revisar"
          ? "text-[var(--warn)]"
          : "text-[var(--titulo)]";
  return (
    <div className={cn("card elev-1 flex min-w-0 flex-col gap-1 border-l-4 p-4", FILO[tono])}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold text-[var(--fg)]">{etiqueta}</p>
        <ChipIcono icono={icono} tono={tono} chico />
      </div>
      <p className={cn("break-words text-2xl font-extrabold tabular leading-tight", color)}>{valor}</p>
      {detalle ? <p className="text-sm text-[var(--fg-muted)]">{detalle}</p> : null}
      {accion ? <div className="mt-auto pt-1">{accion}</div> : null}
    </div>
  );
}

/* ------------------------------------------------- Sección numerada --- */

/**
 * El título de un paso de formulario: el número en su círculo azul, el
 * título en grande y la ayuda debajo. Es el de `/accesibilidad` (función
 * `Seccion`), que es el que se aprobó el 27/11: el número dice cuántos pasos
 * son y en cuál estás sin leer nada.
 */
export function EncabezadoNumerado({
  numero,
  titulo,
  ayuda,
  id,
  chico = false,
}: {
  numero: number;
  titulo: React.ReactNode;
  ayuda?: React.ReactNode;
  id?: string;
  /** Dentro de un diálogo, un punto menos. */
  chico?: boolean;
}) {
  const Titulo = chico ? "h3" : "h2";
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
        aria-hidden="true"
      >
        {numero}
      </span>
      <div className="min-w-0">
        <Titulo id={id} className={cn("font-bold text-[var(--titulo)]", chico ? "text-lg" : "text-xl")}>
          {titulo}
        </Titulo>
        {ayuda ? <div className="mt-0.5 text-base text-[var(--fg-muted)]">{ayuda}</div> : null}
      </div>
    </div>
  );
}
