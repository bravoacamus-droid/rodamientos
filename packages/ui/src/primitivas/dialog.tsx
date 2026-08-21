"use client";
/*
 * "use client" OBLIGATORIO: Radix Dialog mantiene estado de apertura, gestiona
 * el foco atrapado, el portal y el `aria-modal`. Todo eso vive en el navegador.
 *
 * Sustituye al `Modal` hecho a mano de la demo (client.tsx). Se cambia porque
 * aquel no atrapaba el foco ni lo devolvía al cerrar, y bloqueaba el scroll
 * escribiendo `document.body.style.overflow` a mano —que se pisa cuando hay
 * dos diálogos abiertos, cosa que pasa al facturar desde el listado.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]",
        "data-[state=open]:anim-fade-in data-[state=closed]:anim-fade-out",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ancho = "max-w-lg",
  mostrarCerrar = true,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Content> & {
  /** Clase de ancho máximo. Los constructores usan `max-w-4xl`. */
  ancho?: string;
  mostrarCerrar?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border bg-surface elev-3",
          "data-[state=open]:anim-pop-in data-[state=closed]:anim-pop-out",
          ancho,
          className,
        )}
        {...props}
      >
        {children}
        {mostrarCerrar && (
          <DialogPrimitive.Close
            className="absolute right-3.5 top-3.5 rounded-sm p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("border-b px-5 py-3.5 pr-12", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-sm font-semibold text-fg", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("mt-0.5 text-xs text-muted", className)} {...props} />
  );
}

export function DialogBody({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-surface-2 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
