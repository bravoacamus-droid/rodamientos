"use client";
/*
 * "use client": vive dentro de la DataTable y reacciona a la selección.
 *
 * Barra flotante de acciones en lote. Aparece pegada al pie del contenedor de
 * la tabla en cuanto hay una fila marcada — que es el flujo que pidió Willy:
 * marcar varias cotizaciones y facturarlas o aprobarlas de una vez.
 *
 * Detalles que importan:
 *  · `role="region"` con `aria-live="polite"`: el lector de pantalla anuncia
 *    cuántas filas hay seleccionadas sin robar el foco.
 *  · No tapa la última fila: el contenedor de la tabla reserva su alto.
 */
import * as React from "react";
import { X } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "../primitivas/button";

export function BarraLote({
  cantidad,
  onLimpiar,
  children,
  className,
}: {
  cantidad: number;
  onLimpiar: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (cantidad === 0) return null;
  return (
    <div
      role="region"
      aria-label="Acciones sobre la selección"
      className={cn(
        "no-print sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t bg-surface px-4 py-2.5 elev-2",
        "anim-fade-up",
        className,
      )}
    >
      <p className="text-xs font-medium text-fg" aria-live="polite">
        <span className="tabular">{cantidad}</span>{" "}
        {cantidad === 1 ? "fila seleccionada" : "filas seleccionadas"}
      </p>
      <Button variant="ghost" size="xs" onClick={onLimpiar}>
        <X />
        Quitar selección
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
