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
        <DialogPrimitive.Close
          className="absolute right-3.5 top-3.5 rounded-sm p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("shrink-0 border-b px-5 py-3.5 pr-12", className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-sm font-semibold text-fg", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("mt-0.5 text-xs text-muted", className)} {...props} />
  );
}

/** Cuerpo con scroll propio: el encabezado y el pie quedan fijos. */
export function SheetBody({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("shrink-0 flex items-center justify-end gap-2 border-t bg-surface-2 px-5 py-3", className)}
      {...props}
    />
  );
}
