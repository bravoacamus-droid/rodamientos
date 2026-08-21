"use client";

// Cliente por dos razones: marcar el enlace activo con usePathname(), y abrir
// y cerrar el cajón en móvil.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  cn,
  Sheet,
  SheetBody,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@rodatech/ui";
import { Logo } from "@/componentes/logo";
import type { GrupoNav } from "@/lib/navegacion";

/**
 * Navegación de módulos.
 *
 * El mismo listado se pinta en dos sitios —la columna fija de escritorio y el
 * cajón de móvil— desde una sola función. Duplicarlo era garantizar que un día
 * se agregara un módulo en uno y no en el otro.
 *
 * Antes solo existía la columna, con `hidden md:flex`. En un teléfono eso
 * significaba que no había forma de llegar a ningún módulo: el ERP se abría en
 * el tablero y ahí se quedaba.
 */

function Enlaces({
  grupos,
  ruta,
  onNavegar,
}: {
  grupos: GrupoNav[];
  ruta: string;
  onNavegar?: () => void;
}) {
  return (
    <>
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1">
          <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
            {grupo.titulo}
          </p>
          {grupo.items.map((item) => {
            // Coincidencia exacta o de prefijo con separador, para que
            // /inventario no marque activo estando en /inventario/kardex…
            // pero /inventario/kardex sí marque su propio ítem.
            const activo = ruta === item.ruta || ruta.startsWith(item.ruta + "/");
            return (
              <Link
                key={item.ruta}
                href={item.ruta}
                aria-current={activo ? "page" : undefined}
                onClick={onNavegar}
                className={cn(
                  // 44 px de alto en móvil: es la medida mínima para acertar
                  // con el dedo sin pelear.
                  "flex min-h-11 items-center rounded-sm px-2 py-1.5 text-sm transition-colors md:min-h-0",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                  activo
                    ? "bg-brand-600 font-medium text-white"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
                )}
              >
                {item.etiqueta}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Columna fija. Desde `md` hacia arriba. */
export function BarraLateral({ grupos }: { grupos: GrupoNav[] }) {
  const ruta = usePathname();

  return (
    <nav
      aria-label="Módulos"
      className="hidden w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex"
    >
      <Link href="/dashboard" className="px-2 py-1">
        <Logo className="h-9 w-auto" />
      </Link>
      <Enlaces grupos={grupos} ruta={ruta} />
    </nav>
  );
}

/** Cajón de móvil. Se cierra solo al navegar. */
export function MenuMovil({ grupos }: { grupos: GrupoNav[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger
        className="-ml-1 flex size-10 items-center justify-center rounded-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:hidden"
        aria-label="Abrir menú de módulos"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </SheetTrigger>

      <SheetContent lado="izquierda" className="w-72 max-w-[85vw] p-0">
        <SheetTitle className="sr-only">Módulos</SheetTitle>
        <div className="border-b border-[var(--border)] p-4">
          <Link href="/dashboard" onClick={() => setAbierto(false)}>
            <Logo className="h-8 w-auto" />
          </Link>
        </div>
        <SheetBody className="flex flex-col gap-5 p-4">
          <Enlaces grupos={grupos} ruta={ruta} onNavegar={() => setAbierto(false)} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
