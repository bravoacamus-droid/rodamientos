"use client";
/*
 * "use client" OBLIGATORIO: Radix RadioGroup implementa el roving tabindex
 * (un solo tabstop para todo el grupo, flechas para moverse) y `role="radiogroup"`.
 *
 * En el ERP: forma de pago (contado / crédito), motivo de traslado de la guía,
 * tipo de comprobante. Grupos de 2-5 opciones excluyentes y siempre visibles.
 */
import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "../lib/utils";

export function RadioGroup({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} />;
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "size-4 shrink-0 rounded-full border-2 border-[var(--border-strong)] bg-surface",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-brand-600",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-brand-600 text-brand-600" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

/** Opción con etiqueta y ayuda, en tarjeta clicable. */
export function RadioCampo({
  id,
  value,
  label,
  ayuda,
  disabled,
  className,
}: {
  id: string;
  value: string;
  label: string;
  ayuda?: string;
  disabled?: boolean;
  className?: string;
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-surface-2",
        "has-[[data-state=checked]]:border-brand-300 has-[[data-state=checked]]:bg-brand-50 dark:has-[[data-state=checked]]:bg-brand-950",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} aria-describedby={idAyuda} className="mt-0.5" />
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
    </div>
  );
}
