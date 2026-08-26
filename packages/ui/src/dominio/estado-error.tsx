/*
 * EstadoError — SIN "use client" (el botón de reintentar sí lo es; ver abajo).
 *
 * Cuando una consulta falla, el ERP tiene que decir tres cosas: qué se estaba
 * intentando, que NO se perdió nada, y cómo reintentar. Nunca un "algo salió
 * mal" a secas: el operador necesita saber si puede seguir facturando.
 *
 * El detalle técnico (`detalle`) va en un <details> plegado. Se muestra porque
 * es lo que se copia y se pega al reportar la incidencia — no se oculta, pero
 * tampoco se le planta encima al usuario.
 */
import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "../lib/utils";
import { BotonReintentar } from "./boton-reintentar";

export function EstadoError({
  titulo = "No se pudieron cargar los datos",
  descripcion = "La consulta no llegó a completarse. No se ha modificado ni perdido nada; puedes volver a intentarlo.",
  detalle,
  accion,
  mostrarReintentar = true,
  className,
}: {
  titulo?: string;
  descripcion?: string;
  /** Mensaje técnico del error, para copiar al reportar. */
  detalle?: string;
  /** Acción alternativa (volver al listado, ir al inicio). */
  accion?: React.ReactNode;
  mostrarReintentar?: boolean;
  className?: string;
}) {
  return (
    <div
      // `alert`: esto sí interrumpe. El lector de pantalla debe anunciarlo.
      role="alert"
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <div
        aria-hidden="true"
        className="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-bg text-danger [&_svg]:size-6"
      >
        <AlertTriangle />
      </div>
      <p className="text-sm font-semibold text-fg">{titulo}</p>
      <p className="mt-1 max-w-md text-xs text-muted">{descripcion}</p>

      {(mostrarReintentar || accion) && (
        <div className="mt-4 flex items-center gap-2">
          {mostrarReintentar && <BotonReintentar />}
          {accion}
        </div>
      )}

      {detalle && (
        <details className="mt-5 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs font-medium text-subtle hover:text-fg">
            Detalle técnico
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            {detalle}
          </pre>
        </details>
      )}
    </div>
  );
}
