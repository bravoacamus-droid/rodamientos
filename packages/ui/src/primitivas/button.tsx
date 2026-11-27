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
import { Slot, Slottable } from "@radix-ui/react-slot";
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
        /*
          «Dale más vida» (27/11, sobre el tablero). Los secundarios eran
          blanco con borde gris: junto a una fila de texto parecían otra
          casilla, no algo que se pulsa. Ahora todos llevan el azul suave de
          la marca, letra azul en negrita y la flecha que avanza al pasar el
          ratón — el mismo lenguaje que `boton-fila` de las listas, de modo
          que «Abrir», «Ver todas» y «Ver» se reconocen igual en todo el
          sistema. El principal gana un degradado y sube un pelo al pasar.
        */
        primary:
          "bg-brand-600 bg-linear-to-b from-brand-500 to-brand-700 text-white font-semibold relieve hover:from-brand-600 hover:to-brand-800 hover:relieve-alto hover:-translate-y-px motion-reduce:hover:translate-y-0",
        accent:
          "bg-accent-400 bg-linear-to-b from-accent-300 to-accent-400 text-steel-950 font-semibold relieve hover:from-accent-200 hover:to-accent-300 hover:relieve-alto hover:-translate-y-px motion-reduce:hover:translate-y-0",
        outline:
          "border border-[var(--boton-fila-borde)] bg-[var(--boton-fila-bg)] text-[var(--boton-fila-fg)] font-semibold elev-1 hover:border-[var(--boton-fila-borde-hover)] hover:bg-[var(--boton-fila-bg-hover)] [&_.lucide-arrow-right]:transition-transform hover:[&_.lucide-arrow-right]:translate-x-0.5 motion-reduce:hover:[&_.lucide-arrow-right]:translate-x-0",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        subtle: "bg-surface-2 text-fg border hover:border-brand-300",
        // Letra en --fg-inverso (27/11): en oscuro el rojo y el verde son
        // claros (#f2666e, #34c98a) y el blanco encima daba 3:1 o menos. En
        // claro --fg-inverso sigue siendo blanco.
        danger: "bg-danger text-[var(--fg-inverso)] hover:brightness-95 relieve",
        success: "bg-ok text-[var(--fg-inverso)] hover:brightness-95 relieve",
        link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "h-control-xs rounded-sm px-2 text-sm [&_svg]:size-3.5",
        sm: "h-control-sm rounded-md px-3 text-sm",
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
      {/*
        `Slottable` y no `{children}` a secas.

        Con `asChild`, Slot exige UN solo hijo, y aquí siempre van dos: el
        hueco del spinner —que vale `false` cuando no hay `loading`, pero
        ocupa su sitio en el array— y el contenido. Sin esto, cualquier
        `<Button asChild><Link …/></Button>` revienta en el servidor con
        «Slot failed to slot onto its children», que es exactamente lo que
        pasó la primera vez que se usó.

        `Slottable` le dice a Slot cuál de los dos es el hijo real; el spinner
        se queda de hermano. Sin `asChild` no cambia nada.
      */}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}
