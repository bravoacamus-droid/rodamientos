/*
 * Skeleton — SIN "use client". Solo clases; la animación es CSS puro y
 * `prefers-reduced-motion` ya la anula desde tokens.css.
 *
 * Los esqueletos van dentro de `loading.tsx` / `<Suspense>`: en el ERP la
 * tabla debe aparecer antes que los KPIs, no esperar a la consulta más lenta.
 */
import * as React from "react";

import { cn } from "../lib/utils";

export function Skeleton({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}

export function SkeletonTexto({ lineas = 3, className }: { lineas?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lineas }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Esqueleto de tabla. `columnas` debe coincidir con la tabla real o el salto
 *  de layout al cargar es peor que no poner esqueleto. */
export function SkeletonTabla({ filas = 8, columnas = 6 }: { filas?: number; columnas?: number }) {
  return (
    <div className="card elev-1 overflow-hidden" role="status" aria-label="Cargando datos">
      <div className="flex gap-3 border-b bg-surface-2 px-3 py-2.5">
        {Array.from({ length: columnas }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border-soft)]">
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex items-center gap-3 px-3 py-3">
            {Array.from({ length: columnas }, (_, c) => (
              <Skeleton
                key={c}
                className="h-3 flex-1"
                style={{ opacity: 1 - f * 0.06, maxWidth: c === 0 ? "22%" : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando datos…</span>
    </div>
  );
}

export function SkeletonTarjetas({ cantidad = 4, alto = 96 }: { cantidad?: number; alto?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Cargando indicadores">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="card elev-1 p-4" style={{ height: alto }}>
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
          <Skeleton className="mt-3 h-2 w-20" />
        </div>
      ))}
    </div>
  );
}
