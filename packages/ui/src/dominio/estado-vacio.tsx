/*
 * EstadoVacio — SIN "use client".
 *
 * Un listado vacío nunca debe quedarse en blanco: hay que decir POR QUÉ está
 * vacío y qué hacer a continuación. Son dos casos distintos y se escriben
 * distinto:
 *   · "todavía no hay nada"  → invita a crear el primero.
 *   · "el filtro no devuelve nada" → invita a quitar el filtro.
 * Confundirlos hace que el operador crea que perdió datos.
 */
import * as React from "react";

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
      className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}
    >
      {icono && (
        <div
          aria-hidden="true"
          className="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-2 text-subtle [&_svg]:size-6"
        >
          {icono}
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-xs text-muted">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
