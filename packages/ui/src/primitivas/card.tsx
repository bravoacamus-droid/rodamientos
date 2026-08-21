/*
 * Card — SIN "use client".
 *
 * Se conserva tal cual de la demo (no es de shadcn): la composición
 * Card/Header/Title/Description/Content/Footer ya está usada en todas las
 * pantallas y su densidad (padding 20px, título de 13px) está calibrada para
 * el ERP. shadcn habría traído más aire del que cabe en estas pantallas.
 */
import * as React from "react";

import { cn } from "../lib/utils";

export function Card({
  className,
  hover,
  ...props
}: React.ComponentPropsWithRef<"div"> & { hover?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "card elev-1",
        hover && "transition-[box-shadow,border-color] duration-200 hover:elev-2 hover:border-brand-200",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithRef<"h3">) {
  return <h3 className={cn("text-[13px] font-semibold tracking-tight text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithRef<"p">) {
  return <p className={cn("mt-0.5 text-xs text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-b-[var(--radius-lg)] border-t bg-surface-2 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
