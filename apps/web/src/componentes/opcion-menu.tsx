"use client";

import type { LucideIcon } from "lucide-react";
import { DropdownMenuItem } from "@rodatech/ui";

/**
 * Una opción del menú «Acciones», con su icono en una pastilla de color.
 *
 * Moisés, 02/11, con la captura del menú de pedidos: *«se ven sin gracia, no
 * tiene buenos colores, no resaltan bien»*. Las pastillas ya eran de color,
 * pero `DropdownMenuItem` pinta TODOS sus iconos de gris (`[&_svg]:text-subtle`)
 * y les ganaba: icono oscuro sobre fondo oscuro, una mancha. Aquí el icono va
 * blanco y a la fuerza, la pastilla es más grande y el color dice qué hace
 * cada opción —ver, papel, facturar, peligro— antes de leerla.
 */
export const TONO_OPCION = {
  marca: "bg-brand-600",
  azul: "bg-sky-600",
  gris: "bg-slate-500",
  verde: "bg-emerald-600",
  ambar: "bg-amber-500",
  violeta: "bg-violet-600",
  rojo: "bg-red-600",
} as const;

export type TonoOpcion = keyof typeof TONO_OPCION;

export function OpcionMenu({
  icono: Icono,
  tono,
  titulo,
  detalle,
  onSelect,
  peligro = false,
  apagada = false,
  destacada = false,
}: {
  icono: LucideIcon;
  tono: TonoOpcion;
  titulo: string;
  detalle?: string;
  onSelect: () => void;
  peligro?: boolean;
  /** Se ve, pero al pulsarla avisa de qué falta en vez de llevar a nada. */
  apagada?: boolean;
  /** La acción que toca ahora (aprobar, facturar): fondo suave de su color. */
  destacada?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={[
        "min-h-11 items-center gap-3 rounded-lg px-2 py-2",
        apagada ? "opacity-60" : "",
        peligro ? "focus:bg-[var(--danger-bg)] data-[highlighted]:bg-[var(--danger-bg)]" : "",
        destacada ? "bg-[var(--ok-bg)] focus:bg-[var(--ok-bg)] data-[highlighted]:bg-[var(--ok-bg)]" : "",
      ].join(" ")}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg shadow-sm ${TONO_OPCION[tono]} [&>svg]:!size-4 [&>svg]:!text-white`}
      >
        <Icono aria-hidden="true" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={`text-sm font-semibold leading-5 ${peligro ? "text-[var(--danger)]" : destacada ? "text-[var(--ok)]" : "text-[var(--fg)]"}`}
        >
          {titulo}
        </span>
        {detalle ? <span className="text-sm leading-5 text-[var(--fg-muted)]">{detalle}</span> : null}
      </span>
    </DropdownMenuItem>
  );
}
