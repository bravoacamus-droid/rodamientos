"use client";
/*
 * "use client" OBLIGATORIO: mismo motivo que Dialog — Radix Dialog por dentro.
 *
 * El Sheet es el panel lateral. En el ERP se usa para filtros avanzados del
 * catálogo y para la ficha rápida de un producto sin abandonar el listado:
 * el operador no pierde el sitio en la tabla.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "../lib/utils";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

const sheetVariants = cva(
  "fixed z-50 flex flex-col border bg-surface elev-3 transition-none",
  {
    variants: {
      lado: {
        derecha:
          "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=open]:anim-in-right data-[state=closed]:anim-out-right",
        izquierda:
          "inset-y-0 left-0 h-full w-full max-w-md border-r data-[state=open]:anim-in-left data-[state=closed]:anim-out-left",
        arriba:
          "inset-x-0 top-0 max-h-[80dvh] border-b data-[state=open]:anim-in-top data-[state=closed]:anim-out-top",
        abajo:
          "inset-x-0 bottom-0 max-h-[80dvh] border-t data-[state=open]:anim-in-bottom data-[state=closed]:anim-out-bottom",
      },
    },
    defaultVariants: { lado: "derecha" },
  },
);

export function SheetContent({
  className,
  children,
  lado,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <SheetPortal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ lado }), className)} {...props}>
        {children}
        {/* 36 px de lado, como el del diálogo (27/11): el aspa de 16 px con
            4 de aire era un blanco diminuto y casi invisible. */}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Cerrar"
        >
          <X className="size-[1.125rem]" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  // Con la raya de la marca y el velo azul, igual que la cabecera del
  // diálogo (27/11): un panel lateral es un diálogo pegado al borde.
  return (
    <div
      className={cn(
        "relative shrink-0 border-b bg-[var(--seccion-bg)] px-5 pb-4 pt-5 pr-14",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1 before:filo-marca",
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  // `text-xl` en negrita (27/11), como el del diálogo: era `text-sm`, del
  // tamaño de una celda de tabla.
  return (
    <DialogPrimitive.Title
      className={cn("text-xl font-bold leading-tight tracking-tight text-[var(--titulo)]", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("mt-1.5 text-base leading-snug text-muted", className)} {...props} />
  );
}

/** Cuerpo con scroll propio: el encabezado y el pie quedan fijos. */
export function SheetBody({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      // Botones de 44 px como mínimo, como en el pie del diálogo (27/11).
      className={cn(
        "shrink-0 flex flex-wrap items-center justify-end gap-3 border-t bg-surface-2 px-5 py-4",
        "[&>a]:min-h-11 [&>button]:min-h-11",
        className,
      )}
      {...props}
    />
  );
}
