"use client";
/*
 * "use client" OBLIGATORIO: Radix Select renderiza en portal, posiciona y
 * gestiona teclado y foco.
 *
 * CUÁNDO USAR ESTE Y NO `SelectNativo`:
 *   · opciones con contenido rico (icono, dos líneas, precio a la derecha)
 *   · grupos con encabezado
 *   · listas largas que necesitan posicionamiento sobre el disparador
 * Para el resto —unidad de medida, moneda, tipo de documento— usa
 * `SelectNativo`: es más rápido de operar y funciona sin JavaScript.
 */
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "../lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-control-md w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-sm text-fg",
        "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
        "data-[placeholder]:text-subtle aria-[invalid=true]:border-danger",
        "[&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-subtle" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-lg border bg-surface text-fg elev-3",
          "data-[state=open]:anim-pop-in data-[state=closed]:anim-pop-out",
          position === "popper" &&
            "max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-subtle">
          <ChevronUp className="size-3.5" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-subtle">
          <ChevronDown className="size-3.5" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-[0.8rem] outline-none",
        "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5 text-brand-600" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-subtle", className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-[var(--border-soft)]", className)} {...props} />
  );
}
