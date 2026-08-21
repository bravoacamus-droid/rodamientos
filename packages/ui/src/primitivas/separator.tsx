/*
 * Separator — SIN "use client".
 *
 * No usamos @radix-ui/react-separator: su única aportación es poner
 * `role="separator"` / `aria-orientation`, y eso lo escribimos aquí sin
 * arrastrar un módulo cliente. Por defecto es decorativo (`role="none"`),
 * que es lo correcto en el 95 % de los casos.
 */
import * as React from "react";

import { cn } from "../lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentPropsWithRef<"div"> & {
  orientation?: "horizontal" | "vertical";
  /** `false` cuando el separador realmente divide dos secciones distintas. */
  decorative?: boolean;
}) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-[var(--border)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
