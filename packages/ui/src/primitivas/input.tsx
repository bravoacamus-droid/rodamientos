/*
 * Input · Textarea · SelectNativo
 *
 * SIN "use client": son elementos nativos con clases. Sirven igual en un
 * formulario de Server Action (`<form action={...}>`, sin JavaScript) que
 * dentro de un componente cliente controlado.
 */
import * as React from "react";

import { cn } from "../lib/utils";

/** Estilo compartido por todos los campos de texto. Un solo sitio que tocar. */
export const campoBase = [
  "w-full rounded-md border bg-surface text-fg placeholder:text-subtle",
  "transition-colors duration-150",
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
  "disabled:opacity-60 disabled:bg-surface-2 disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15",
  "read-only:bg-surface-2",
].join(" ");

export interface InputProps extends React.ComponentPropsWithRef<"input"> {
  /** Alinea a la derecha y activa tabular-nums. Para cantidades y precios. */
  numerico?: boolean;
}

export function Input({ className, numerico, ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      className={cn(
        campoBase,
        "h-control-md px-3 text-sm",
        numerico && "text-right tabular",
        // Ocultar el spinner nativo ya se hace en tokens.css; aquí solo el
        // ancho de la caret zone.
        "file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(campoBase, "min-h-[76px] resize-y px-3 py-2 text-sm", className)}
      {...props}
    />
  );
}

/** Flecha del select dibujada en el fondo: evita un icono extra en el DOM. */
const FLECHA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238894a2' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/**
 * Select NATIVO.
 *
 * Convive a propósito con el `Select` de Radix (select.tsx). En formularios
 * largos del ERP —unidad de medida, moneda, tipo de documento— el nativo se
 * opera más rápido con teclado, no necesita JavaScript y funciona dentro de
 * un `<form action>` de Server Action. El de Radix se reserva para cuando
 * hace falta contenido rico en las opciones (iconos, dos líneas, grupos).
 */
export function SelectNativo({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"select">) {
  return (
    <select
      data-slot="select-nativo"
      className={cn(
        campoBase,
        "h-control-md cursor-pointer appearance-none bg-no-repeat pl-3 pr-8 text-sm",
        className,
      )}
      style={{
        backgroundImage: FLECHA,
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "1rem",
      }}
      {...props}
    >
      {children}
    </select>
  );
}
