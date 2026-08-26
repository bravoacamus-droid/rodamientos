"use client";
/*
 * "use client" OBLIGATORIO: Radix Checkbox mantiene el estado (incluido el
 * tercer estado `indeterminate`, que la DataTable necesita para "seleccionar
 * todo" cuando solo hay algunas filas marcadas) y sincroniza un input oculto.
 */
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "../lib/utils";

export function Checkbox({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border-2 border-[var(--border-strong)] bg-surface",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600",
        "data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/**
 * Checkbox con etiqueta en tarjeta. Se conserva de la demo porque el patrón
 * "opción con explicación debajo" se repite en configuración, en detracción y
 * en las opciones del PDF de la cotización.
 */
export function CheckboxCampo({
  id,
  label,
  ayuda,
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CheckboxPrimitive.Root> & {
  id: string;
  label: string;
  ayuda?: string;
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
        props.checked ? "border-brand-300 bg-brand-50 dark:bg-brand-950" : "hover:bg-surface-2",
        props.disabled && "opacity-60",
        className,
      )}
    >
      <Checkbox id={id} aria-describedby={idAyuda} className="mt-0.5" {...props} />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            "block cursor-pointer text-[0.8rem] font-medium",
            props.checked ? "text-brand-800 dark:text-brand-200" : "text-fg",
            props.disabled && "cursor-not-allowed",
          )}
        >
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
