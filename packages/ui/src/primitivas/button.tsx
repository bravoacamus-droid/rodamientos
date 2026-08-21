/*
 * Button
 *
 * SIN "use client": es un `<button>` con clases. No usa hooks ni estado.
 * Un Server Component puede renderizarlo directamente (por ejemplo dentro de
 * un `<form action={serverAction}>`), y un Client Component puede pasarle
 * `onClick`. Marcarlo como cliente empujaría al bundle todas las páginas que
 * solo quieren un botón de submit.
 *
 * Se conservan las variantes de la demo (primary/accent/outline/ghost/subtle/
 * danger/success/link) en lugar de las de shadcn (default/destructive/…):
 * ya están cableadas en 30 pantallas y describen mejor la intención.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "active:scale-[0.985] motion-reduce:active:scale-100",
    "[&_svg]:shrink-0 [&_svg]:size-4 [&_svg]:pointer-events-none",
    // El foco lo pinta la regla global :focus-visible de tokens.css; aquí solo
    // nos aseguramos de que el outline no quede tapado por el hermano.
    "focus-visible:z-10",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700 elev-1 hover:elev-2",
        accent: "bg-accent-400 text-steel-950 hover:bg-accent-300 elev-1 hover:elev-2 font-semibold",
        outline: "border bg-surface text-fg hover:bg-surface-2 hover:border-brand-300",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        subtle: "bg-surface-2 text-fg border hover:border-brand-300",
        danger: "bg-danger text-white hover:brightness-95 elev-1",
        success: "bg-ok text-white hover:brightness-95 elev-1",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "h-control-xs rounded-sm px-2 text-[11px] [&_svg]:size-3.5",
        sm: "h-control-sm rounded-md px-3 text-xs",
        md: "h-control-md rounded-md px-4 text-sm",
        lg: "h-control-lg rounded-lg px-6 text-sm",
        icon: "h-control-md w-control-md rounded-md",
        "icon-sm": "h-control-sm w-control-sm rounded-sm [&_svg]:size-3.5",
        "icon-xs": "h-control-xs w-control-xs rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentPropsWithRef<"button">,
    VariantProps<typeof buttonVariants> {
  /** Renderiza el hijo en lugar de un `<button>` (para envolver un `<Link>`). */
  asChild?: boolean;
  /** Muestra el spinner y bloquea el control. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      // Con asChild no hay atributo `disabled`, así que lo comunicamos a la
      // tecnología de apoyo por ARIA.
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </Comp>
  );
}
