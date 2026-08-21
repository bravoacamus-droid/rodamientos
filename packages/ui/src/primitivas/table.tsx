/*
 * Primitivas de tabla — SIN "use client".
 *
 * Son los estilos crudos de `<table>`: cabecera pegajosa, filas densas,
 * separadores suaves. `DataTable` (src/tabla) los usa por dentro, pero se
 * exportan porque hay tablas del ERP que se renderizan enteras en el servidor
 * (detalle de una cotización, ítems de una guía) y no necesitan TanStack.
 *
 * `Table` incluye ya su propio contenedor con scroll horizontal: la página
 * nunca debe desplazarse en horizontal, solo la tabla.
 */
import * as React from "react";

import { cn } from "../lib/utils";

export function TableContenedor({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div data-slot="table-contenedor" className={cn("scroll-x w-full", className)} {...props} />;
}

export function Table({
  className,
  contenedorClassName,
  ...props
}: React.ComponentPropsWithRef<"table"> & { contenedorClassName?: string }) {
  return (
    <TableContenedor className={contenedorClassName}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </TableContenedor>
  );
}

export function THead({ className, ...props }: React.ComponentPropsWithRef<"thead">) {
  return (
    <thead
      className={cn(
        "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-2",
        "[&_th]:border-b [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[11px]",
        "[&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-subtle [&_th]:whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.ComponentPropsWithRef<"tbody">) {
  return (
    <tbody
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[var(--border-soft)] [&_tr:last-child]:border-0",
        "[&_tr]:transition-colors [&_tr:hover]:bg-surface-2",
        "[&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle",
        className,
      )}
      {...props}
    />
  );
}

export function TFoot({ className, ...props }: React.ComponentPropsWithRef<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "border-t bg-surface-2 [&_td]:px-3 [&_td]:py-2.5 [&_td]:font-semibold [&_td]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Celda numérica: alineada a la derecha y con dígitos de ancho fijo. */
export function TdNum({ className, ...props }: React.ComponentPropsWithRef<"td">) {
  return <td className={cn("tabular text-right", className)} {...props} />;
}

/** Cabecera de columna numérica: se alinea con `TdNum`. */
export function ThNum({ className, ...props }: React.ComponentPropsWithRef<"th">) {
  return <th className={cn("!text-right", className)} {...props} />;
}
