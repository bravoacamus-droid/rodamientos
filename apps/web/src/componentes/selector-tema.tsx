"use client";

// Cliente: lee y escribe la preferencia de tema, que vive en el navegador.

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Interruptor de tema.
 *
 * Existe porque antes el tema lo decidía el sistema operativo sin que nadie
 * pudiera cambiarlo: quien tenía Windows en oscuro abría el ERP en oscuro y no
 * había forma de sacarlo de ahí.
 *
 * Hasta que el componente monta no se sabe cuál está activo —la preferencia
 * está en `localStorage`, que en el servidor no existe— así que se reserva el
 * hueco con un botón vacío. Sin eso la cabecera pega un salto al hidratar.
 */
export function SelectorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => setMontado(true), []);

  const oscuro = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(oscuro ? "light" : "dark")}
      aria-label={oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={oscuro ? "Tema claro" : "Tema oscuro"}
      className="flex size-9 items-center justify-center rounded-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      {!montado ? (
        <span className="size-4" />
      ) : oscuro ? (
        // Sol: lo que vas a obtener si pulsas.
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
