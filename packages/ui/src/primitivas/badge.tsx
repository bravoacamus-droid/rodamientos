/*
 * Badge — SIN "use client". Es un `<span>`.
 * Etiqueta genérica. Para estados de documento usa `EstadoBadge` del dominio,
 * que además fija qué color le toca a cada estado.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted border-app",
        brand: "bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:border-brand-800",
        accent:
          "bg-accent-50 text-accent-800 border-accent-200 dark:bg-accent-900/30 dark:text-accent-200 dark:border-accent-800",
        success: "bg-ok-bg text-ok border-transparent",
        warning: "bg-warn-bg text-warn border-transparent",
        danger: "bg-danger-bg text-danger border-transparent",
        info: "bg-info-bg text-info border-transparent",
        solid: "bg-brand-600 text-white border-transparent",
      },
      /*
        LOS TRES TAMAÑOS SON `text-sm`. No es un descuido: el tamaño solo
        gradúa el RELLENO, nunca la letra.

        Los tres eran `text-xs` —12,75 px con la base de este proyecto— y eso
        va contra la primera regla de CLAUDE.md: nada por debajo de 14 px en
        algo que hay que leer. Y una pastilla es de lo que MÁS hay que leer:
        dice si un documento está emitido o anulado, si una cuenta está
        inactiva, si una serie es de pruebas. Willy no ve bien, y «una cifra
        que no se lee y una cifra que no existe valen lo mismo».

        Si hace falta que una pastilla ocupe menos, se le baja el relleno con
        `size="xs"`. La letra no se toca (24/09).
      */
      size: {
        xs: "px-1.5 py-0.5 text-sm",
        sm: "px-2 py-0.5 text-sm",
        md: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.ComponentPropsWithRef<"span">,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
