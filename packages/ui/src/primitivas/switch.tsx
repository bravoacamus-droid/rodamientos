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

export function Switch({ className, ...props }: React.ComponentPropsWithRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "bg-[var(--border-strong)] transition-colors",
        "data-[state=checked]:bg-brand-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0",
          "transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
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
        <label htmlFor={id} className="block cursor-pointer text-[0.8rem] font-medium text-fg">
          {label}
        </label>
        {ayuda && (
          <p id={idAyuda} className="mt-0.5 text-xs leading-snug text-muted">
            {ayuda}
          </p>
        )}
      </div>
      <Switch id={id} aria-describedby={idAyuda} className="mt-0.5" {...props} />
    </div>
  );
}
