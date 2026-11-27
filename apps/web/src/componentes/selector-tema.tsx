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
 * 27/11 — con borde y palabra, como «Letra y colores» a su lado: era un
 * icono gris suelto de 16 px, justo lo que CLAUDE.md §1 dice que no vale
 * («una persona que no sabe que tiene que darle click ahí»). La palabra dice
 * lo que se obtiene al pulsar —«Oscuro» o «Claro»—, igual que el icono. Por
 * debajo de 1024 px, donde el menú lateral y «Dónde estás» ya llenan la barra,
 * queda el icono, con su nombre para el lector de pantalla.
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
      className="inline-flex h-control-md items-center gap-2 rounded-md border border-[var(--boton-fila-borde)] bg-[var(--boton-fila-bg)] px-3 text-sm font-semibold text-[var(--boton-fila-fg)] transition-colors hover:border-[var(--boton-fila-borde-hover)] hover:bg-[var(--boton-fila-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      {!montado ? (
        <span className="size-5" />
      ) : oscuro ? (
        // Sol: lo que vas a obtener si pulsas.
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
      {/* Antes de montar, la palabra más larga reserva el hueco: sin eso el
          botón cambia de ancho al hidratar. */}
      <span className="hidden min-w-[3.25rem] text-left lg:inline">
        {!montado ? "" : oscuro ? "Claro" : "Oscuro"}
      </span>
    </button>
  );
}
