"use client";
/*
 * "use client" OBLIGATORIO: Radix Tabs gestiona el estado activo y la
 * navegación con flechas (`role="tablist"` con roving tabindex).
 *
 * OJO: si las pestañas cambian QUÉ datos se consultan (por ejemplo el estado
 * del documento en el listado de cotizaciones), NO uses Tabs — usa enlaces
 * que escriban un search param, para que la pestaña sea compartible y el
 * servidor haga la consulta. Tabs es para alternar contenido ya cargado
 * (los tres bloques de una ficha de producto).
 */
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("scroll-x flex gap-1 border-b", className)} {...props} />;
}

export function TabsTrigger({
  className,
  children,
  contador,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger> & { contador?: number }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "group relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2",
        "text-[13px] font-medium text-muted transition-colors hover:text-fg",
        "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 dark:data-[state=active]:text-brand-300",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      {contador !== undefined && (
        <span
          className={cn(
            "tabular rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-semibold text-subtle",
            "group-data-[state=active]:bg-brand-100 group-data-[state=active]:text-brand-700",
          )}
        >
          {contador}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 outline-none", className)} {...props} />;
}
