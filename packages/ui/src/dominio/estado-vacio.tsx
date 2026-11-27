/*
 * EstadoVacio — SIN "use client".
 *
 * Un listado vacío nunca debe quedarse en blanco: hay que decir POR QUÉ está
 * vacío y qué hacer a continuación. Son dos casos distintos y se escriben
 * distinto:
 *   · "todavía no hay nada"  → invita a crear el primero.
 *   · "el filtro no devuelve nada" → invita a quitar el filtro.
 * Confundirlos hace que el operador crea que perdió datos.
 *
 * 27/11 — con presencia. Era un icono gris de 24 px sobre gris y una frase en
 * `text-base`: en una tarjeta blanca se leía como un hueco, no como un aviso.
 * Ahora el icono va grande en su chip del azul de la marca, con un aro
 * alrededor que recuerda al rodamiento, el título en `text-lg` negrita y la
 * explicación en `text-base`. Si la pantalla no trae icono se pone uno de
 * bandeja: un vacío sin dibujo volvía a ser un hueco.
 */
import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "../lib/utils";

export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
  className,
}: {
  icono?: React.ReactNode;
  titulo: string;
  descripcion?: string;
  /** Botón o enlace. Debe ser el siguiente paso, no un "volver". */
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      // `status` y no `alert`: informa, pero no es una urgencia que deba
      // interrumpir lo que el operador esté leyendo.
      role="status"
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <div aria-hidden="true" className="relative mb-5 grid place-items-center">
        {/* El aro: dos anillos finos, como las pistas de un rodamiento. Es
            decoración y va en el color de los bordes, así que en contraste
            alto se vuelve una raya firme y no se pierde. */}
        <span className="absolute size-[5.5rem] rounded-full border border-dashed border-[var(--border-strong)]" />
        <span className="flex size-16 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-600 shadow-[var(--elev-1)] dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300 [&_svg]:size-8">
          {icono ?? <Inbox />}
        </span>
      </div>
      <p className="text-lg font-bold text-[var(--titulo)]">{titulo}</p>
      {descripcion && <p className="mt-1.5 max-w-md text-base leading-relaxed text-muted">{descripcion}</p>}
      {accion && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{accion}</div>}
    </div>
  );
}
