"use client";

// Cliente: lee y escribe la preferencia de tema, que vive en el navegador.

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

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
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
