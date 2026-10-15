"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@rodatech/ui";

/**
 * Las páginas de una lista que se filtra en la pantalla (15/10). Luis, de «Qué
 * vende»: *«es una lista grande y puede crecer»*. Dos botones con su palabra y
 * cuántos se ven de cuántos; no números de página, que con 3 o 4 páginas solo
 * estorban.
 */
export function PaginasLista({
  pagina,
  tamano,
  total,
  onCambiar,
}: {
  pagina: number;
  tamano: number;
  total: number;
  onCambiar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  if (total <= tamano) return null;
  const desde = (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);
  return (
    <nav aria-label="Páginas de la lista" className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-[var(--fg-muted)]" aria-live="polite">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onCambiar(pagina - 1)} disabled={pagina <= 1}>
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onCambiar(pagina + 1)} disabled={pagina >= paginas}>
          Siguiente
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/** El trozo de la página `pagina` (1, 2, 3…), sin salirse del final. */
export function trozo<T>(filas: readonly T[], pagina: number, tamano: number): { filas: T[]; pagina: number } {
  const paginas = Math.max(1, Math.ceil(filas.length / tamano));
  const p = Math.min(Math.max(1, pagina), paginas);
  return { filas: filas.slice((p - 1) * tamano, p * tamano), pagina: p };
}
