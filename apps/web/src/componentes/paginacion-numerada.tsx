"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, SelectNativo, cn } from "@rodatech/ui";

import { FILAS_POR_PAGINA, totalPaginas, ventanaPaginas } from "@/lib/paginacion";

/**
 * Páginas numeradas con su selector de filas (23/11).
 *
 * Luis, del kardex: *«que tenga un select… de mostrar 10, 15, 30, 50, pero
 * igual una paginación»*. Dice de entrada cuántas hay y en cuál se está
 * —«16–30 de 2,812»—, deja saltar a la primera, a la última o a la de al
 * lado, y las flechas llevan su palabra: dos flechas sueltas no parecen
 * botones (revisión por módulos del 02/10).
 *
 * Escribe `?p=` y `?n=` en la URL y no toca el resto de los filtros.
 * Cambiar las filas vuelve a la primera página: la 40 de 10 en 10 no existe
 * de 50 en 50.
 */
export function PaginacionNumerada({
  pagina,
  porPagina,
  total,
  nombre = { uno: "registro", varios: "registros" },
}: {
  pagina: number;
  porPagina: number;
  total: number;
  /** Cómo se llama lo que se cuenta: «movimiento» / «movimientos». */
  nombre?: { uno: string; varios: string };
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = React.useTransition();

  const paginas = totalPaginas(total, porPagina);
  const actual = Math.min(Math.max(1, pagina), paginas);
  const desde = total === 0 ? 0 : (actual - 1) * porPagina + 1;
  const hasta = Math.min(actual * porPagina, total);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    iniciar(() => router.push(s ? `${ruta}?${s}` : ruta, { scroll: false }));
  };
  // La primera página y el tamaño de siempre no se escriben: la URL limpia.
  const aPagina = (n: number) => ir({ p: n <= 1 ? null : String(n) });

  const boton = "h-10 min-w-10 px-3 text-sm";

  return (
    <nav
      aria-label="Páginas de la lista"
      className={cn(
        "no-print flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3",
        pendiente && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-[var(--fg-muted)]" aria-live="polite">
          {total === 0 ? (
            "Ninguno"
          ) : (
            <>
              <span className="font-semibold tabular text-[var(--fg)]">
                {desde.toLocaleString("es-PE")}–{hasta.toLocaleString("es-PE")}
              </span>{" "}
              de{" "}
              <span className="font-semibold tabular text-[var(--fg)]">{total.toLocaleString("es-PE")}</span>{" "}
              {total === 1 ? nombre.uno : nombre.varios}
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
          Mostrar
          <SelectNativo
            value={String(porPagina)}
            aria-label="Filas por página"
            onChange={(e) => ir({ n: e.target.value, p: null })}
            className="h-10 w-[4.75rem] text-sm"
          >
            {FILAS_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectNativo>
          por página
        </label>
      </div>

      {paginas > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className={boton}
            disabled={actual <= 1 || pendiente}
            onClick={() => aPagina(actual - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Anterior
          </Button>

          {/* Los números desde la tableta; en el teléfono, «Página 3 de 40». */}
          <span className="px-2 text-sm text-[var(--fg-muted)] sm:hidden">
            Página <span className="font-semibold tabular text-[var(--fg)]">{actual}</span> de{" "}
            <span className="tabular">{paginas}</span>
          </span>
          <ol className="hidden items-center gap-1.5 sm:flex">
            {ventanaPaginas(actual, paginas).map((n, i) =>
              n === "…" ? (
                <li key={`salto-${i}`} aria-hidden="true" className="px-1 text-sm text-[var(--fg-subtle)]">
                  …
                </li>
              ) : (
                <li key={n}>
                  <Button
                    type="button"
                    variant={n === actual ? "primary" : "outline"}
                    className={cn(boton, "tabular")}
                    aria-current={n === actual ? "page" : undefined}
                    aria-label={`Página ${n}`}
                    disabled={pendiente}
                    onClick={() => n !== actual && aPagina(n)}
                  >
                    {n}
                  </Button>
                </li>
              ),
            )}
          </ol>

          <Button
            type="button"
            variant="outline"
            className={boton}
            disabled={actual >= paginas || pendiente}
            onClick={() => aPagina(actual + 1)}
          >
            Siguiente
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
