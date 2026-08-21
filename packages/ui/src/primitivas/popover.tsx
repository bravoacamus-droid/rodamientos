"use client";
/*
 * "use client" OBLIGATORIO: Radix Popover posiciona con Floating UI, abre
 * portal y gestiona foco y cierre por Escape / clic fuera.
 *
 * Base del DatePicker, del Combobox y del BuscadorProductos.
 */
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-lg border bg-surface p-0 text-fg elev-3 outline-none",
          // Nunca más alto ni más ancho que la ventana: el catálogo devuelve
          // listas largas y el popover no puede empujar la página.
          "max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-hidden",
          "data-[state=open]:anim-pop-in data-[state=closed]:anim-pop-out",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
