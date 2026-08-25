"use client";
/*
 * "use client" OBLIGATORIO: escriben en los search params de la URL.
 *
 * Filtros de listado. Van dentro de `barraHerramientas` de la DataTable.
 *
 * Todos comparten la misma regla: el filtro NO guarda estado propio más allá
 * de lo que el operador está tecleando. La verdad está en la URL, y el
 * servidor vuelve a consultar. Así el enlace "catálogo SKF con stock cero" se
 * puede pegar en un WhatsApp y abre exactamente esa vista.
 */
import * as React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "../primitivas/button";
import { SelectNativo } from "../primitivas/input";
import { PARAMS } from "./tipos";
import { useParamsTabla } from "./use-params-tabla";

/** Contenedor de la barra: se pega arriba de la tabla, dentro de la tarjeta. */
export function BarraHerramientas({ className, children, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("no-print flex flex-wrap items-center gap-2 border-b px-3 py-2.5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Búsqueda libre sincronizada con la URL.
 *
 * El valor tecleado sí vive en estado local (para que el campo responda al
 * instante) y se manda a la URL con retardo. Sin ese retardo, escribir "6205"
 * dispara cuatro consultas al catálogo.
 */
export function BuscadorTabla({
  placeholder = "Buscar…",
  param = PARAMS.busqueda,
  retardo = 320,
  autoFocus,
  className,
}: {
  placeholder?: string;
  param?: string;
  retardo?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const { obtener, fijar, pendiente } = useParamsTabla();
  const valorUrl = obtener(param) ?? "";
  const [valor, setValor] = React.useState(valorUrl);

  // Si la URL cambia desde fuera (botón atrás, "limpiar filtros"), el campo
  // tiene que seguirla.
  React.useEffect(() => {
    setValor(valorUrl);
  }, [valorUrl]);

  React.useEffect(() => {
    if (valor === valorUrl) return;
    const t = setTimeout(() => fijar({ [param]: valor || null }), retardo);
    return () => clearTimeout(t);
    // `fijar` cambia con cada searchParams; incluirlo reiniciaría el temporizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, valorUrl, param, retardo]);

  return (
    <div className={cn("relative min-w-[12rem] flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        type="search"
        autoFocus={autoFocus}
        value={valor}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValor(e.target.value)}
        className={cn(
          "h-control-sm w-full rounded-md border bg-surface pl-9 pr-8 text-sm text-fg placeholder:text-subtle",
          "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {(valor || pendiente) && (
        <button
          type="button"
          onClick={() => setValor("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle transition-colors hover:text-fg"
        >
          {pendiente ? (
            <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <X className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

/** Filtro de un valor. Se resalta cuando está activo, para que se vea que la
 *  lista está recortada y no es que "no haya datos". */
export function FiltroSelect({
  param,
  opciones,
  placeholder,
  className,
}: {
  param: string;
  opciones: readonly { valor: string; etiqueta: string }[];
  placeholder: string;
  className?: string;
}) {
  const { obtener, fijar } = useParamsTabla();
  const actual = obtener(param) ?? "";

  return (
    <SelectNativo
      value={actual}
      aria-label={placeholder}
      onChange={(e) => fijar({ [param]: e.target.value || null })}
      className={cn(
        "h-control-sm w-auto text-xs",
        actual && "border-brand-300 bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-200",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </SelectNativo>
  );
}

/** Botón "limpiar filtros" con el contador de filtros activos. */
export function BotonLimpiarFiltros({ className }: { className?: string }) {
  const { filtrosActivos, limpiarFiltros } = useParamsTabla();
  if (filtrosActivos === 0) return null;
  return (
    <Button variant="ghost" size="sm" onClick={limpiarFiltros} className={className}>
      <SlidersHorizontal />
      Limpiar {filtrosActivos} {filtrosActivos === 1 ? "filtro" : "filtros"}
    </Button>
  );
}
