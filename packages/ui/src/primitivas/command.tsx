"use client";
/*
 * "use client" OBLIGATORIO: cmdk mantiene el filtrado, el ítem resaltado y
 * toda la navegación por teclado.
 *
 * Es la base de tres cosas del ERP:
 *   1. la paleta ⌘K de navegación global,
 *   2. el `Combobox` genérico,
 *   3. el `BuscadorProductos`, que es el control más usado del sistema.
 *
 * Nota sobre `shouldFilter`: en las búsquedas contra el servidor hay que
 * pasar `shouldFilter={false}`. cmdk filtra en cliente por defecto y volvería
 * a descartar resultados que el servidor ya consideró buenos (por ejemplo un
 * SKU que se encontró por su código de fabricante).
 */
import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

export function Command({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg bg-surface text-fg", className)}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  contenedorClassName,
  icono,
  sufijo,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive.Input> & {
  /** Estilo del envoltorio. Permite que el buscador de productos lo pinte
   *  como un campo normal en vez de como cabecera de paleta. */
  contenedorClassName?: string;
  icono?: React.ReactNode;
  /** Contenido a la derecha (spinner, atajo de teclado). */
  sufijo?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-2 border-b px-3", contenedorClassName)}>
      {icono ?? <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />}
      <CommandPrimitive.Input
        className={cn(
          "h-10 w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {sufijo}
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-[min(20rem,60dvh)] overflow-y-auto overflow-x-hidden p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: React.ComponentPropsWithRef<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-3 py-8 text-center text-xs text-muted" {...props} />;
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden text-fg",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
        "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-[var(--border-soft)]", className)} {...props} />;
}

export function CommandItem({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none",
        "data-[selected=true]:bg-surface-2 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: React.ComponentPropsWithRef<"span">) {
  return <span className={cn("ml-auto text-[10px] tracking-widest text-subtle", className)} {...props} />;
}

export function CommandLoading(props: React.ComponentPropsWithRef<typeof CommandPrimitive.Loading>) {
  return <CommandPrimitive.Loading {...props} />;
}

/**
 * Paleta de comandos ⌘K. `titulo` y `descripcion` no se ven: son el nombre
 * accesible del diálogo, que Radix exige y los lectores de pantalla anuncian.
 */
export function CommandDialog({
  abierto,
  onAbiertoChange,
  titulo = "Buscar en el ERP",
  descripcion = "Busca productos, clientes, cotizaciones y facturas, o salta a un módulo.",
  children,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  titulo?: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent ancho="max-w-xl" mostrarCerrar={false} className="top-[15%] translate-y-0 p-0">
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{descripcion}</DialogDescription>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Registra el atajo ⌘K / Ctrl+K.
 * Se expone como hook para que la app decida dónde montar la paleta.
 */
export function usarAtajoPaleta(alAbrir: () => void): void {
  React.useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        alAbrir();
      }
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [alAbrir]);
}
