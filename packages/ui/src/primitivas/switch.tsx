"use client";
/*
 * "use client" OBLIGATORIO: Radix Switch mantiene estado y expone
 * `role="switch"` con `aria-checked`.
 *
 * REGLA en el ERP: el Switch se usa cuando el cambio se aplica AL INSTANTE
 * (activar detracción en la factura, mostrar la columna de descuento en el
 * PDF). Si el valor solo se guarda al pulsar "Guardar", va un Checkbox: el
 * switch promete inmediatez y romper esa promesa confunde.
 */
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../lib/utils";

export function Switch({
  className,
  tamano = "md",
  ...props
}: React.ComponentPropsWithRef<typeof SwitchPrimitive.Root> & {
  /** `lg` para lo que decide dinero y tiene que verse de lejos (la retención de la factura). */
  tamano?: "md" | "lg";
}) {
  const lg = tamano === "lg";
  return (
    <SwitchPrimitive.Root
      className={cn(
        lg ? "h-8 w-14" : "h-5 w-9",
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "bg-[var(--border-strong)] transition-colors",
        "data-[state=checked]:bg-brand-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0",
          lg ? "size-7 data-[state=checked]:translate-x-6" : "size-4 data-[state=checked]:translate-x-4",
          "transition-transform data-[state=unchecked]:translate-x-0",
          "motion-reduce:transition-none",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

/** Switch con etiqueta a la izquierda, alineado como una fila de ajustes. */
export function SwitchCampo({
  id,
  label,
  ayuda,
  className,
  ...props
}: React.ComponentPropsWithRef<typeof SwitchPrimitive.Root> & {
  id: string;
  label: string;
  ayuda?: string;
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className={cn("flex items-start justify-between gap-4 py-1.5", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-fg">
          {label}
        </label>
        {ayuda && (
          <p id={idAyuda} className="mt-0.5 text-sm leading-snug text-muted">
            {ayuda}
          </p>
        )}
      </div>
      <Switch id={id} aria-describedby={idAyuda} className="mt-0.5" {...props} />
    </div>
  );
}
