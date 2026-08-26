/*
 * Label
 *
 * SIN "use client" y SIN @radix-ui/react-label a propósito.
 *
 * Radix Label solo añade una cosa: evitar que el doble clic sobre la etiqueta
 * seleccione texto. A cambio convierte en cliente cualquier formulario que la
 * use, y en este ERP hay formularios largos que se renderizan enteros en el
 * servidor. El `<label htmlFor>` nativo ya asocia correctamente, que es lo que
 * importa para accesibilidad.
 */
import * as React from "react";

import { cn } from "../lib/utils";

export interface LabelProps extends React.ComponentPropsWithRef<"label"> {
  /** Marca el campo como obligatorio (asterisco + texto para lectores). */
  requerido?: boolean;
}

export function Label({ className, requerido, children, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle",
        "peer-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
      {requerido && (
        <>
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
          <span className="sr-only"> (obligatorio)</span>
        </>
      )}
    </label>
  );
}

/**
 * Campo: label + control + ayuda/error.
 * Para formularios SIN react-hook-form (filtros, diálogos rápidos). Si usas
 * react-hook-form, usa `FormField` + `FormControl`, que además cablean el
 * `aria-describedby` solos.
 *
 * Aquí el cableado es semiautomático: `Campo` asocia el `<label>` al control
 * por `htmlFor`/`id`, y genera los ids `"{id}-ayuda"` y `"{id}-error"`. El
 * control debe declararlos en su `aria-describedby`:
 *
 *     <Campo id="peso" label="Peso" ayuda="En kilogramos" error={error}>
 *       <Input id="peso" aria-describedby={error ? "peso-error" : "peso-ayuda"} />
 *     </Campo>
 */
export function Campo({
  id,
  label,
  ayuda,
  error,
  requerido,
  children,
  className,
}: {
  /** Debe coincidir con el `id` del control que va dentro. */
  id: string;
  label?: string;
  ayuda?: string;
  error?: string;
  requerido?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  return (
    <div className={className} data-slot="campo">
      {label && (
        <Label htmlFor={id} requerido={requerido}>
          {label}
        </Label>
      )}
      {children}
      {ayuda && !error && (
        <p id={idAyuda} className="mt-1 text-xs text-subtle">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
