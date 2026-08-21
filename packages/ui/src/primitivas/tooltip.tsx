"use client";
/*
 * "use client" OBLIGATORIO: Radix Tooltip usa temporizadores y portal.
 *
 * Reemplaza al tooltip CSS de la demo, que solo aparecía con :hover — o sea,
 * invisible para quien navega con teclado. Radix lo abre también con foco.
 *
 * REGLA: el tooltip NUNCA es el único sitio donde vive una información. Es
 * para desambiguar iconos, no para esconder datos.
 */
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-md bg-steel-950 px-2 py-1 text-[11px] font-medium text-white elev-2",
          "dark:bg-steel-100 dark:text-steel-950",
          "data-[state=delayed-open]:anim-fade-in",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Atajo para el caso habitual: envolver un botón de icono.
 * Requiere un `TooltipProvider` en el layout de la app.
 */
export function TooltipSimple({
  texto,
  children,
  lado = "top",
}: {
  texto: string;
  children: React.ReactNode;
  lado?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={lado}>{texto}</TooltipContent>
    </Tooltip>
  );
}
