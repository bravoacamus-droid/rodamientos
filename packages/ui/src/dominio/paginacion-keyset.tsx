"use client";
/*
 * "use client" OBLIGATORIO: escribe el cursor en los search params.
 *
 * Paginación por KEYSET (cursor), no por offset.
 *
 * Por qué: `OFFSET 2000` obliga a Postgres a leer y tirar 2.000 filas antes de
 * devolver la página. Con el catálogo de Willy la página 40 cuesta 40 veces la
 * primera. El keyset arrastra `WHERE (clave) > :cursor ORDER BY clave LIMIT n`,
 * que ataca el índice y cuesta lo mismo en cualquier punto del listado.
 *
 * Lo que se pierde: el salto a "página 27" y el "de 40 páginas". Este
 * componente NO los finge. Muestra cuántos registros hay en pantalla y, si el
 * servidor pudo contarlos sin que salga caro, el total.
 *
 * Contrato con la consulta:
 *   · `cursorSiguiente` = clave de la ÚLTIMA fila, o null si no hay más.
 *   · `cursorAnterior`  = clave de la PRIMERA fila, o null si es la primera página.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "../primitivas/button";
import { SelectNativo } from "../primitivas/input";
import { PARAMS } from "../tabla/tipos";
import { useParamsTabla } from "../tabla/use-params-tabla";

const TAMANOS = [25, 50, 100, 200] as const;

export interface PaginacionKeysetProps {
  /** Filas que hay ahora en pantalla. */
  cantidadEnPagina: number;
  cursorSiguiente: string | null;
  cursorAnterior: string | null;
  /** Total filtrado, si el servidor lo pudo contar barato. */
  total?: number;
  /** Filas por página actuales. */
  porPagina?: number;
  /** Permite cambiar el tamaño de página. */
  tamanoAjustable?: boolean;
  className?: string;
}

export function PaginacionKeyset({
  cantidadEnPagina,
  cursorSiguiente,
  cursorAnterior,
  total,
  porPagina = 50,
  tamanoAjustable = true,
  className,
}: PaginacionKeysetProps) {
  const { irACursor, fijar, pendiente } = useParamsTabla();

  const hayAnterior = Boolean(cursorAnterior);
  const haySiguiente = Boolean(cursorSiguiente);

  return (
    <nav
      aria-label="Paginación del listado"
      className={cn("no-print flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5", className)}
    >
      <p className="text-xs text-muted" aria-live="polite">
        <span className="tabular font-medium text-fg">{cantidadEnPagina.toLocaleString("es-PE")}</span>{" "}
        {cantidadEnPagina === 1 ? "registro" : "registros"} en pantalla
        {total !== undefined && (
          <>
            {" · "}
            <span className="tabular font-medium text-fg">{total.toLocaleString("es-PE")}</span> en total
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {tamanoAjustable && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="hidden sm:inline">Filas</span>
            <SelectNativo
              value={String(porPagina)}
              aria-label="Filas por página"
              onChange={(e) => fijar({ [PARAMS.tamano]: e.target.value })}
              className="h-control-sm w-[4.5rem] text-xs"
            >
              {TAMANOS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectNativo>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!hayAnterior || pendiente}
            onClick={() => irACursor(cursorAnterior, "ant")}
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Anterior</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!haySiguiente || pendiente}
            onClick={() => irACursor(cursorSiguiente, "sig")}
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
