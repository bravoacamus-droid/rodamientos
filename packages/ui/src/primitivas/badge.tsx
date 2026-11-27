/*
 * Badge — SIN "use client". Es un `<span>`.
 * Etiqueta genérica. Para estados de documento usa `EstadoBadge` del dominio,
 * que además fija qué color le toca a cada estado.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export const badgeVariants = cva(
  // Negrita y con el icono a 14 px (27/11), igual que `EstadoBadge`: una
  // pastilla en `font-medium` con un icono de 12 px se leía como texto suelto
  // con un fondo, no como una marca. Los tonos de estado llevan además su
  // borde de color, que es lo que queda en contraste alto, donde el fondo
  // pasa a blanco.
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        // `surface-3` y letra en `fg` (27/11), como el gris de EstadoBadge:
        // en `surface-2` desaparecía sobre las filas alternas de las listas.
        neutral: "bg-surface-3 text-fg border-[var(--border-strong)]",
        brand: "bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:border-brand-800",
        accent:
          "bg-accent-50 text-accent-800 border-accent-200 dark:bg-accent-900/30 dark:text-accent-200 dark:border-accent-800",
        success: "bg-ok-bg text-ok border-ok/30",
        warning: "bg-warn-bg text-warn border-warn/35",
        danger: "bg-danger-bg text-danger border-danger/30",
        info: "bg-info-bg text-info border-info/30",
        solid: "bg-brand-600 text-white border-transparent",
      },
      /*
        LOS TRES TAMAÑOS SON `text-sm`. No es un descuido: el tamaño solo
        gradúa el RELLENO, nunca la letra.

        Los tres eran `text-sm` —12,75 px con la base de este proyecto— y eso
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
        md: "px-3 py-1 text-sm",
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
