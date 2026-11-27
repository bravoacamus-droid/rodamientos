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
  // La raya de abajo, de 2 px y firme (27/11): es el «suelo» sobre el que se
  // apoyan las pestañas. Con 1 px gris no se veía que eran un grupo.
  return (
    <TabsPrimitive.List
      className={cn("scroll-x flex gap-1 border-b-2 border-[var(--border-strong)]", className)}
      {...props}
    />
  );
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
        /*
          PESTAÑAS QUE PARECEN PESTAÑAS (27/11).

          Eran texto gris de 14 px con una raya debajo de la activa: a ojos de
          Willy, una fila de palabras, no algo que se pulsa. Ahora tienen
          cuerpo —44 px de alto, `text-base`, esquinas de arriba redondas— y
          la activa se separa de las demás con el fondo de la tarjeta, la letra
          en el azul de los títulos y la raya de la marca debajo, de 3 px.
          Las inactivas llevan un velo para que también se lean como botón.
        */
        "group relative -mb-0.5 flex min-h-11 items-center gap-2 whitespace-nowrap rounded-t-lg border border-b-0 border-transparent px-4 py-2",
        "text-base font-semibold text-muted transition-colors",
        "bg-surface-2 hover:bg-[var(--cabecera-bg)] hover:text-fg",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-transparent",
        "data-[state=active]:border-[var(--border-strong)] data-[state=active]:bg-surface data-[state=active]:text-[var(--titulo)]",
        "data-[state=active]:after:filo-marca",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-[1.125rem] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      {contador !== undefined && (
        <span
          className={cn(
            "tabular min-w-7 rounded-full bg-surface-3 px-2 py-px text-center text-sm font-bold text-fg",
            "group-data-[state=active]:bg-brand-600 group-data-[state=active]:text-white",
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
  return <TabsPrimitive.Content className={cn("mt-5 outline-none", className)} {...props} />;
}
