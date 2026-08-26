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
      size: {
        xs: "px-1.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
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
