"use client";
/*
 * "use client" OBLIGATORIO: Radix DropdownMenu implementa navegación por
 * teclado (flechas, typeahead), portal y gestión de foco.
 *
 * Es el menú "⋯" de cada fila de la tabla y el de acciones en lote.
 */
import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn } from "../lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuPortal = Menu.Portal;
export const DropdownMenuSub = Menu.Sub;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

const contenidoBase = [
  "z-50 min-w-[12rem] overflow-hidden rounded-lg border bg-surface p-1 elev-3",
  "data-[state=open]:anim-pop-in data-[state=closed]:anim-pop-out",
].join(" ");

const itemBase = [
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[0.8rem] text-fg outline-none",
  "focus:bg-surface-2 data-[highlighted]:bg-surface-2",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-subtle",
].join(" ");

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn(contenidoBase, className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructivo,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.Item> & { destructivo?: boolean }) {
  return (
    <Menu.Item
      className={cn(itemBase, destructivo && "text-danger [&_svg]:text-danger", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemBase, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <Menu.ItemIndicator>
          <Check className="size-3.5 !text-brand-600" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemBase, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <Menu.ItemIndicator>
          <Circle className="size-2 fill-current !text-brand-600" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithRef<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-subtle", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-[var(--border-soft)]", className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: React.ComponentPropsWithRef<"span">) {
  return <span className={cn("ml-auto text-xs tracking-widest text-subtle", className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(itemBase, className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent className={cn(contenidoBase, className)} {...props} />
    </Menu.Portal>
  );
}
