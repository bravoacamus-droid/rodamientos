"use client";
/*
 * "use client" OBLIGATORIO: estado de apertura + término de búsqueda.
 *
 * Combobox SÍNCRONO: la lista completa ya está en memoria (marcas, familias,
 * unidades, ubigeo precargado, vendedores). Filtra en cliente.
 * Para listas que hay que consultar al servidor —el catálogo de 2.000+ SKU—
 * usa `BuscadorProductos`, que aborta las peticiones que llegan tarde.
 */
import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "../lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface OpcionCombobox {
  valor: string;
  etiqueta: string;
  /** Segunda línea, más pequeña. Por ejemplo el RUC bajo el nombre. */
  detalle?: string;
  deshabilitada?: boolean;
}

export interface ComboboxProps {
  id: string;
  opciones: readonly OpcionCombobox[];
  valor: string | null;
  onCambio: (valor: string | null) => void;
  placeholder?: string;
  placeholderBusqueda?: string;
  textoVacio?: string;
  deshabilitado?: boolean;
  invalido?: boolean;
  /** Permite borrar la selección con la X. */
  limpiable?: boolean;
  className?: string;
}

export function Combobox({
  id,
  opciones,
  valor,
  onCambio,
  placeholder = "Seleccionar…",
  placeholderBusqueda = "Buscar…",
  textoVacio = "Sin coincidencias.",
  deshabilitado,
  invalido,
  limpiable = true,
  className,
}: ComboboxProps) {
  const [abierto, setAbierto] = React.useState(false);
  const seleccionada = React.useMemo(
    () => opciones.find((o) => o.valor === valor) ?? null,
    [opciones, valor],
  );

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <div className={cn("relative", className)}>
        <PopoverTrigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={invalido || undefined}
          disabled={deshabilitado}
          className={cn(
            "flex h-control-md w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-sm",
            "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
            "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
            invalido && "border-danger",
            seleccionada && limpiable && "pr-14",
          )}
        >
          <span className={cn("truncate text-left", seleccionada ? "text-fg" : "text-subtle")}>
            {seleccionada?.etiqueta ?? placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
        </PopoverTrigger>

        {seleccionada && limpiable && !deshabilitado && (
          <button
            type="button"
            aria-label="Quitar selección"
            onClick={() => onCambio(null)}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)]">
        <Command>
          <CommandInput placeholder={placeholderBusqueda} />
          <CommandList>
            <CommandEmpty>{textoVacio}</CommandEmpty>
            <CommandGroup>
              {opciones.map((o) => (
                <CommandItem
                  key={o.valor}
                  value={`${o.etiqueta} ${o.detalle ?? ""}`}
                  disabled={o.deshabilitada}
                  onSelect={() => {
                    onCambio(o.valor === valor ? null : o.valor);
                    setAbierto(false);
                  }}
                >
                  <Check
                    className={cn("text-brand-600", o.valor === valor ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.etiqueta}</span>
                    {o.detalle && <span className="block truncate text-[11px] text-subtle">{o.detalle}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
