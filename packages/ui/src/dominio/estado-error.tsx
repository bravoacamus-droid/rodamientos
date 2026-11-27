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
 *
 * 27/11 — el título era `text-sm`, más pequeño que la explicación de debajo,
 * y el botón de reintentar era el pequeño. Ahora el título va en `text-lg`
 * negrita, la explicación en `text-base`, el icono en su chip de 64 px y
 * «Reintentar» del tamaño normal: es lo único que la persona puede hacer.
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
        className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger-bg text-danger shadow-[var(--elev-1)] [&_svg]:size-8"
      >
        <AlertTriangle />
      </div>
      <p className="text-lg font-bold text-[var(--titulo)]">{titulo}</p>
      <p className="mt-1.5 max-w-md text-base leading-relaxed text-muted">{descripcion}</p>

      {(mostrarReintentar || accion) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {mostrarReintentar && <BotonReintentar />}
          {accion}
        </div>
      )}

      {detalle && (
        <details className="mt-6 w-full max-w-lg text-left">
          <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-md px-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg">
            Ver el detalle técnico
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-surface-2 p-3 text-sm leading-relaxed text-muted">
            {detalle}
          </pre>
        </details>
      )}
    </div>
  );
}
