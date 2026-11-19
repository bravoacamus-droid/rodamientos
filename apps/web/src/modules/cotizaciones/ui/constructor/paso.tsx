import type { ReactNode } from "react";

import { cn } from "@rodatech/ui";

/**
 * La banda de arriba de cada tarjeta del constructor: un número, un título y
 * una línea que dice qué se hace ahí.
 *
 * Luis, 19/11: *«productos es lo más importante, darle jerarquía para que el
 * cliente sepa dónde ir»*. El número es lo que dice el orden sin tener que
 * leerlo: primero para quién, después los productos. Willy no tiene que
 * adivinar por dónde se empieza.
 *
 * Un `div` y no un `header`: la regla de `.card > header:first-child h2` le
 * pone la raya de marca delante al título, y aquí ese sitio es del número.
 */
export function CabeceraPaso({
  numero,
  titulo,
  ayuda,
  marca = false,
  children,
  pie,
}: {
  numero: number;
  titulo: string;
  ayuda: ReactNode;
  /**
   * El paso donde se hace el trabajo, en el azul de la marca.
   *
   * Luis, 19/11, de su supervisor: *«en la parte de productos, dale más
   * jerarquía, brandeado profesional, eso es lo más importante»*. Con la
   * banda gris clara seguía siendo una tarjeta más; en azul es lo primero
   * que ve el ojo al abrir la pantalla.
   *
   * `fondo-marca` y no `panel-modulo`: el panel redefine los tokens (todo lo
   * de dentro pasa a vidrio) y recorta lo que sobresale, y aquí dentro va el
   * buscador, cuya lista de resultados tiene que salir por debajo de la banda
   * y leerse sobre blanco.
   */
  marca?: boolean;
  /** Botones a la derecha de la banda. */
  children?: ReactNode;
  /** Lo que va debajo del título, a todo el ancho de la banda. */
  pie?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-t-[var(--radius-xl)] px-4 sm:px-5",
        marca
          ? "fondo-marca z-20 border-b-4 border-[var(--color-accent-400)] py-5 sm:px-6"
          : "border-b border-[var(--border-soft)] bg-[var(--surface-2)] py-3",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-full font-bold tabular",
              marca
                ? "size-11 bg-[var(--color-accent-400)] text-xl text-[#0b3450] shadow-[0_0_0_4px_rgb(253_190_22/0.25)]"
                : "size-8 bg-[var(--color-brand-600)] text-base text-white",
            )}
            aria-hidden="true"
          >
            {numero}
          </span>
          <div className="min-w-0">
            <h2
              className={cn(
                "font-bold leading-tight",
                marca ? "text-2xl text-white" : "text-lg text-[var(--titulo)]",
              )}
            >
              <span className="sr-only">Paso {numero}: </span>
              {titulo}
            </h2>
            <p className={cn("text-sm", marca ? "text-[#d6e4f0]" : "text-[var(--fg-muted)]")}>
              {ayuda}
            </p>
          </div>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
      {pie ? <div className="mt-4">{pie}</div> : null}
    </div>
  );
}
