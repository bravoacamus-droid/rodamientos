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
          // EL MOLDE NO SE PUEDE SALTAR POR DESCUIDO.
          //
          // `DialogHeader`, `DialogBody` y `DialogFooter` ponen el aire, la
          // línea de separación y el fondo del pie. Pero eran opcionales, y de
          // los quince diálogos del ERP **trece no los usaban**: el contenido
          // salía pegado a los bordes, y por eso «se veían rotos y apretados».
          //
          // No se arreglan trece pantallas a mano y se confía en que la
          // catorceava se acuerde. Si dentro no hay ninguna sección del molde,
          // esto pone el aire por su cuenta; si las hay, no estorba.
          ancho,
          className,
        )}
        {...props}
      >
        {children}
        {mostrarCerrar && (
          // 36 px de lado, no 24. Era un icono de 16 con 4 de aire: un blanco
          // diminuto para el ratón y casi invisible para quien no ve de cerca
          // —que es el caso de Willy—. Ahora tiene cuerpo, un fondo al pasar
          // por encima que dice que se puede pulsar, y un anillo de foco para
          // quien va con el teclado.
          <DialogPrimitive.Close
            className={cn(
              "absolute right-3 top-3 grid size-9 place-items-center rounded-md",
              "text-muted transition-colors",
              "hover:bg-surface-2 hover:text-fg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            )}
            aria-label="Cerrar"
          >
            <X className="size-[1.125rem]" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">) {
  // `pr-14` deja sitio al botón de cerrar, que ahora es más grande. Sin eso,
  // un título largo se le mete debajo.
  //
  // Con el color de la casa (27/11): la raya azul → dorado arriba, la misma
  // de la barra superior y del tablero, y un velo azul muy claro detrás del
  // título. Un diálogo era una caja blanca dentro de otra pantalla blanca, y
  // no se distinguía a primera vista dónde empezaba la pregunta. El velo es
  // `--seccion-bg`, que ya está definido en claro, oscuro y contraste alto
  // (en contraste alto pasa a blanco o negro y la raya es lo que queda).
  return (
    <div
      className={cn(
        "relative border-b bg-[var(--seccion-bg)] px-5 pb-4 pt-5 pr-14 sm:px-6",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1 before:filo-marca",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  // `text-base`, no `text-sm`: es la pregunta que la persona tiene que leer
  // antes de decidir, y en un ERP que se usa ocho horas el título de un modal
  // no puede tener el mismo tamaño que una celda de tabla.
  //
  // Y desde el 27/11, `text-xl` en negrita y en el azul de los títulos: con
  // `text-base` medía casi lo mismo que la explicación de debajo, y lo que
  // hay que leer primero no se distinguía de lo segundo.
  return (
    <DialogPrimitive.Title
      className={cn("text-xl font-bold leading-tight tracking-tight text-[var(--titulo)]", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn(
        // `text-base` (27/11): explica lo que se va a decidir; no es una nota
        // al pie.
        "mt-1.5 max-w-prose text-base leading-snug text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        // Los botones del pie, de 44 px como mínimo (27/11): son la decisión
        // del diálogo —«Guardar», «Emitir», «Cancelar»— y con 38 px eran más
        // bajos que el aire que los rodea. `min-h` y no `h`, para no pelear
        // con la altura que traiga cada botón.
        "flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t bg-surface-2 px-5 py-4 sm:px-6",
        "[&>a]:min-h-11 [&>button]:min-h-11",
        className,
      )}
      {...props}
    />
  );
}
