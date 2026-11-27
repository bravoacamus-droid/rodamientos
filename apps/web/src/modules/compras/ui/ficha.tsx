// Sin "use client": son cajas y texto, se pintan en el servidor y valen
// igual dentro de una pantalla de cliente.
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@rodatech/ui";

import { PanelModulo } from "@/componentes/panel-modulo";
import { Volver } from "@/componentes/volver";

/*
 * Las piezas de una FICHA de documento en compras (27/11).
 *
 * Luis, 27/11: sus supervisores encontraban el sistema «muy básico, muy
 * plano, neutral, simple». Las fichas de compra, recepción y proveedor eran
 * un título de 20 px, cuatro cajas blancas iguales y bloques con un rótulo de
 * 14 px: todo pesaba lo mismo y había que leerlo entero para saber qué
 * importaba.
 *
 * Aquí va el patrón del rediseño, una vez y no copiado en cada ficha:
 *   · la cabecera sobre el azul de la marca (`PanelModulo`, el mismo de las
 *     listas): número grande, estado, a quién y la cifra principal en héroe;
 *   · el paso del flujo en el que está el documento;
 *   · bloques con su icono en chip y título de verdad;
 *   · datos con el rótulo arriba y el valor debajo, en negrita.
 *
 * Viven en el módulo de compras porque recepciones y proveedores son de la
 * misma área y se ven juntas; si el resto del ERP las adopta, el sitio es
 * `@/componentes`.
 */

type Tono = "marca" | "entra" | "sale" | "porHacer" | "urgente";

/** El filo izquierdo: verde dinero que entra / bien, azul sale / informa,
 *  ámbar por hacer, rojo urgente. Es el mismo código del tablero. */
const FILO: Record<Tono, string> = {
  marca: "border-l-brand-500",
  entra: "border-l-[var(--ok)]",
  sale: "border-l-[var(--info)]",
  porHacer: "border-l-[var(--warn)]",
  urgente: "border-l-[var(--danger)]",
};

const CHIP: Record<Tono, string> = {
  marca: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-surface-3 dark:text-brand-300 dark:ring-[var(--border)]",
  entra: "bg-ok-bg text-ok ring-[var(--ok)]/20",
  sale: "bg-info-bg text-info ring-[var(--info)]/20",
  porHacer: "bg-warn-bg text-warn ring-[var(--warn)]/25",
  urgente: "bg-danger-bg text-danger ring-[var(--danger)]/25",
};

/** El icono de un bloque en su caja: suelto y en gris se lee como adorno. */
export function ChipIcono({
  children,
  tono = "marca",
  grande = false,
}: {
  children: React.ReactNode;
  tono?: Tono;
  grande?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
        grande ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5",
        CHIP[tono],
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- Cabecera */

export function CabeceraFicha({
  ruta,
  volver,
  tipo,
  numero,
  estado,
  etiquetas,
  quien,
  cifra,
  acciones,
  children,
}: {
  /** La ruta del módulo en el menú: da el tono del panel y su icono. */
  ruta: string;
  volver: { href: string; texto: string };
  /** Qué documento es, en palabras: «Orden de compra». */
  tipo: string;
  numero: React.ReactNode;
  /** La pastilla del estado (`EstadoBadge`). */
  estado?: React.ReactNode;
  /** Etiquetas de segundo orden: la vía de importación, «para stock»… */
  etiquetas?: React.ReactNode;
  quien?: { rotulo: string; nombre: React.ReactNode; detalle?: React.ReactNode };
  /** La cifra que manda: el total de la orden, lo recibido… */
  cifra?: { rotulo: string; valor: React.ReactNode; pie?: React.ReactNode };
  acciones?: React.ReactNode;
  /** Lo que va debajo dentro del azul: los pasos del flujo. */
  children?: React.ReactNode;
}) {
  return (
    <PanelModulo ruta={ruta}>
      <div className="@container flex flex-col gap-5">
        <Volver href={volver.href}>{volver.texto}</Volver>

        <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold text-[var(--fg-muted)]">{tipo}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="break-words font-mono text-3xl font-extrabold tracking-tight text-[var(--titulo)] sm:text-4xl">
                {numero}
              </h1>
              {/* La pastilla un punto más grande que en las listas: aquí es
                  LO que se viene a saber. `text-base` y no un `size` nuevo
                  porque `EstadoBadge` es de otro dueño (27/11). */}
              {estado ? <span className="[&>span]:px-3 [&>span]:py-1.5 [&>span]:text-base">{estado}</span> : null}
              {etiquetas}
            </div>
            {/* La barra dorada del login y del tablero: es la firma de la marca. */}
            <span className="mt-3 block h-2 w-32 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
            {quien ? (
              <div className="mt-3 min-w-0">
                <p className="text-sm font-medium text-[var(--fg-muted)]">{quien.rotulo}</p>
                <p className="break-words text-xl font-bold text-[var(--fg)]">{quien.nombre}</p>
                {quien.detalle ? <p className="text-base text-[var(--fg-muted)]">{quien.detalle}</p> : null}
              </div>
            ) : null}
          </div>

          {cifra ? (
            <div className="min-w-0 rounded-xl bg-white/[0.08] px-5 py-4 ring-1 ring-inset ring-white/15 @3xl:text-right">
              <p className="text-base font-semibold uppercase tracking-wide text-[var(--fg)]">{cifra.rotulo}</p>
              {/* Sin `truncate`: con la letra a 24 px una cifra cortada es una
                  cifra que no existe. Si no cabe, baja de línea. */}
              <p className="tabular mt-1 break-words text-4xl font-extrabold leading-tight tracking-tight text-[var(--titulo)] [&_data]:[font-size:inherit] [&_data]:[color:inherit]">
                {cifra.valor}
              </p>
              {cifra.pie ? <p className="mt-1 text-base text-[var(--fg-muted)]">{cifra.pie}</p> : null}
            </div>
          ) : null}
        </div>

        {children}

        {acciones ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-4">{acciones}</div>
        ) : null}
      </div>
    </PanelModulo>
  );
}

/* ------------------------------------------------------------- Los pasos */

export type EstadoPaso = "hecho" | "ahora" | "falta";

/**
 * En qué paso está el documento. Un círculo con su número —o la marca de
 * hecho— y la palabra: el color no es lo único que lo dice.
 */
export function PasosFicha({ pasos }: { pasos: { nombre: string; estado: EstadoPaso }[] }) {
  return (
    <ol className="grid grid-cols-1 gap-2 @xl:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" aria-label="En qué paso está">
      {pasos.map((p, i) => (
        <li
          key={p.nombre}
          aria-current={p.estado === "ahora" ? "step" : undefined}
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset",
            p.estado === "ahora"
              ? "bg-accent-400 text-steel-950 ring-accent-300"
              : p.estado === "hecho"
                ? "bg-white/[0.12] text-[var(--fg)] ring-white/20"
                : "bg-transparent text-[var(--fg-muted)] ring-white/15",
          )}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-base font-bold",
              p.estado === "ahora"
                ? "bg-steel-950 text-accent-300"
                : p.estado === "hecho"
                  ? "bg-[var(--ok)] text-steel-950"
                  : "border-2 border-white/40",
            )}
            aria-hidden="true"
          >
            {p.estado === "hecho" ? <Check className="size-5" strokeWidth={3} /> : i + 1}
          </span>
          <span className="min-w-0 text-base font-semibold leading-snug">
            {p.nombre}
            <span className="sr-only">
              {p.estado === "hecho" ? " (hecho)" : p.estado === "ahora" ? " (en este paso)" : " (falta)"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------- Bloques */

/**
 * Un bloque de la ficha: `card` con su icono y su título. El título va en un
 * `div` y no en `header` a propósito: tokens.css pinta una raya delante del
 * primer `h2` de una tarjeta, y aquí el chip ya hace ese papel.
 */
export function BloqueFicha({
  icono,
  tono = "marca",
  titulo,
  ayuda,
  accion,
  id,
  className,
  children,
}: {
  icono: React.ReactNode;
  tono?: Tono;
  titulo: string;
  ayuda?: React.ReactNode;
  /** Un botón a la altura del título («Añadir», «Ver todo»). */
  accion?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("card elev-1 @container flex min-w-0 flex-col gap-4 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ChipIcono tono={tono}>{icono}</ChipIcono>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[var(--titulo)]">{titulo}</h2>
            {ayuda ? <p className="text-base text-[var(--fg-muted)]">{ayuda}</p> : null}
          </div>
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Rejilla de datos: una columna en móvil, dos cuando la caja da para ello. */
export function DatosFicha({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 @sm:grid-cols-2", className)}>{children}</dl>;
}

/** Un dato: el rótulo arriba (`etiqueta-dato`) y el valor debajo, en negrita. */
export function DatoFicha({
  etiqueta,
  valor,
  ancho = false,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  /** Ocupa toda la fila (direcciones, observaciones). */
  ancho?: boolean;
}) {
  const vacio = valor === null || valor === undefined || valor === "" || valor === "—";
  return (
    <div className={cn("min-w-0", ancho && "@sm:col-span-2")}>
      <dt className="etiqueta-dato">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 break-words text-base",
          vacio ? "text-[var(--fg-subtle)]" : "font-semibold text-[var(--fg)]",
        )}
      >
        {vacio ? "—" : valor}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- Cifras */

/** Una tarjeta de cifra con su filo de color y, si se da, su icono. */
export function CifraFicha({
  etiqueta,
  valor,
  pie,
  tono = "marca",
  icono,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: React.ReactNode;
  tono?: Tono;
  icono?: React.ReactNode;
}) {
  return (
    <div className={cn("card elev-1 flex min-w-0 flex-col border-l-4 p-4", FILO[tono])}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold text-[var(--fg)]">{etiqueta}</p>
        {icono ? <ChipIcono tono={tono}>{icono}</ChipIcono> : null}
      </div>
      <p className="tabular mt-1 break-words text-3xl font-extrabold leading-tight tracking-tight text-[var(--titulo)] [&_data]:[font-size:inherit] [&_data]:[color:inherit]">
        {valor}
      </p>
      {pie ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{pie}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------- Avisos */

/**
 * Lo que pide hacer algo YA: «falta registrar la compra», «falta recibir».
 * Por encima del resto (`elev-2`), con filo grueso y el botón a la vista.
 */
export function AvisoFicha({
  tono = "porHacer",
  icono,
  titulo,
  children,
  accion,
}: {
  tono?: Exclude<Tono, "marca">;
  icono: React.ReactNode;
  titulo: string;
  children?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  const fondo =
    tono === "urgente"
      ? "bg-danger-bg"
      : tono === "porHacer"
        ? "bg-warn-bg"
        : tono === "entra"
          ? "bg-ok-bg"
          : "bg-info-bg";
  return (
    <div
      className={cn(
        "card elev-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-l-[6px] p-4",
        FILO[tono],
        fondo,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <ChipIcono tono={tono} grande>
          {icono}
        </ChipIcono>
        <div className="min-w-0">
          <p className="text-lg font-bold text-[var(--fg)]">{titulo}</p>
          {children ? <div className="mt-0.5 text-base text-[var(--fg)]">{children}</div> : null}
        </div>
      </div>
      {accion ? <div className="flex flex-wrap gap-2">{accion}</div> : null}
    </div>
  );
}

/**
 * La caja de cuando no hay nada todavía: dice por qué y qué hacer, con el
 * botón si hay un siguiente paso. Más grande que el `EstadoVacio` de las
 * listas porque va dentro de un bloque, no ocupando una tabla entera.
 */
export function VacioFicha({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: React.ReactNode;
  titulo: string;
  children?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-6 text-center"
    >
      <ChipIcono grande>{icono}</ChipIcono>
      <p className="text-lg font-semibold text-[var(--fg)]">{titulo}</p>
      {children ? <div className="max-w-md text-base text-[var(--fg-muted)]">{children}</div> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- Pasos de un formulario */

/**
 * El título numerado de un paso de formulario: círculo azul con el número,
 * título y una línea de ayuda. Es el `Seccion` de Accesibilidad, que es el
 * patrón aprobado (27/11): se lee el orden sin manual.
 */
export function TituloPaso({
  numero,
  titulo,
  ayuda,
  id,
}: {
  numero: number;
  titulo: string;
  ayuda?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
        aria-hidden="true"
      >
        {numero}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-bold text-[var(--titulo)]">
          {titulo}
        </h2>
        {ayuda ? <p className="mt-0.5 text-base text-[var(--fg-muted)]">{ayuda}</p> : null}
      </div>
    </div>
  );
}
