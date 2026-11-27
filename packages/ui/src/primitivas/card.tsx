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
  // `text-lg` en negrita y con el filo de la marca delante (27/11), igual
  // que el primer `h2` de las tarjetas escritas a mano (tokens.css): las dos
  // formas de hacer una tarjeta tienen que dar el mismo título.
  return (
    <h3
      className={cn(
        "flex items-center gap-2.5 text-lg font-bold tracking-tight text-[var(--titulo)]",
        "before:h-[1.2em] before:w-[5px] before:flex-none before:rounded-[3px] before:bg-gradient-to-b before:from-brand-500 before:to-accent-400",
        "print:before:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithRef<"p">) {
  return <p className={cn("mt-1 text-base text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-b-[var(--radius-xl)] border-t bg-surface-2 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
