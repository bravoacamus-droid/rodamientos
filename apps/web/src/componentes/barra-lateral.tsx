"use client";

// Cliente por tres razones: marcar el enlace activo con usePathname(), plegar
// los grupos, y recordar cómo quedaron entre sesiones.

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
import { IconoNav } from "@/componentes/iconos-nav";
import { rutaActiva, type GrupoNav } from "@/lib/navegacion";

/**
 * Navegación de módulos.
 *
 * Tres cosas que antes no hacía:
 *
 * 1. **Iconos.** Diecinueve entradas de solo texto obligan a leer cada una.
 *    Con icono se llega por forma, que es más rápido y es lo que la gente
 *    espera de una herramienta que usa ocho horas al día.
 *
 * 2. **Grupos plegables.** Un vendedor no abre Abastecimiento nunca. Ahora
 *    puede cerrarlo y dejar a la vista lo suyo.
 *
 * 3. **Se acuerda.** El estado de cada grupo va a `localStorage`: plegarlos en
 *    cada carga sería peor que no poder plegarlos. El grupo que contiene la
 *    ruta activa se abre siempre, aunque estuviera cerrado — si no, el enlace
 *    marcado quedaría escondido.
 *
 * El mismo listado se pinta en la columna fija y en el cajón de móvil desde
 * una sola función: duplicarlo garantizaba que un día se agregara un módulo en
 * uno y no en el otro.
 */

const CLAVE = "rodatech.nav.plegados";

/** Grupos plegados, leídos del navegador. Nunca revienta si el valor está roto. */
function leerPlegados(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function usePlegados() {
  // Arranca vacío y se rellena al montar: en el servidor no hay
  // `localStorage`, y leerlo en el primer render rompería la hidratación.
  const [plegados, setPlegados] = React.useState<Set<string>>(new Set());

  React.useEffect(() => setPlegados(leerPlegados()), []);

  const alternar = React.useCallback((titulo: string) => {
    setPlegados((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(titulo)) siguiente.delete(titulo);
      else siguiente.add(titulo);
      try {
        window.localStorage.setItem(CLAVE, JSON.stringify([...siguiente]));
      } catch {
        // Modo privado o almacenamiento lleno: se pliega igual, solo que no
        // se recuerda. No es motivo para romper el menú.
      }
      return siguiente;
    });
  }, []);

  return { plegados, alternar };
}

// Un solo ítem encendido, el más específico. La regla vive en
// `lib/navegacion.ts` y está probada allí.
const activoEn = (ruta: string, item: string) => rutaActiva(ruta) === item;

function Grupos({
  grupos,
  ruta,
  plegados,
  alternar,
  onNavegar,
}: {
  grupos: GrupoNav[];
  ruta: string;
  plegados: Set<string>;
  alternar: (titulo: string) => void;
  onNavegar?: () => void;
}) {
  return (
    <>
      {grupos.map((grupo) => {
        // El grupo que contiene la ruta activa se abre aunque esté plegado:
        // esconder el enlace marcado desorienta más de lo que ahorra.
        const contieneActivo = grupo.items.some((i) => activoEn(ruta, i.ruta));
        const abierto = contieneActivo || !plegados.has(grupo.titulo);

        return (
          <div key={grupo.titulo} className="flex flex-col">
            <button
              type="button"
              onClick={() => alternar(grupo.titulo)}
              aria-expanded={abierto}
              className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)] transition-colors hover:text-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  abierto ? "rotate-90" : "",
                )}
                aria-hidden="true"
              >
                <path
                  d="M9 5l7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {grupo.titulo}
            </button>

            {abierto ? (
              <div className="flex flex-col gap-0.5 pb-1">
                {grupo.items.map((item) => {
                  const activo = activoEn(ruta, item.ruta);
                  return (
                    <Link
                      key={item.ruta}
                      href={item.ruta}
                      aria-current={activo ? "page" : undefined}
                      onClick={onNavegar}
                      className={cn(
                        // 44 px en móvil: la medida mínima para acertar con el
                        // dedo sin pelear.
                        "flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors md:min-h-0",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                        activo
                          ? "bg-brand-600 font-medium text-white"
                          : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
                      )}
                    >
                      <IconoNav
                        nombre={item.icono}
                        className={cn(
                          "size-4 shrink-0",
                          activo ? "" : "text-[var(--fg-subtle)]",
                        )}
                      />
                      <span className="truncate">{item.etiqueta}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Columna fija. Desde `md` hacia arriba. */
export function BarraLateral({ grupos }: { grupos: GrupoNav[] }) {
  const ruta = usePathname();
  const { plegados, alternar } = usePlegados();

  return (
    <nav
      aria-label="Módulos"
      className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] md:flex print:!hidden"
    >
      {/* El logo se queda quieto mientras el menú se desplaza. */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] px-4 pb-3 pt-4">
        <Link href="/dashboard" className="block">
          <Logo className="h-9 w-auto" />
        </Link>
      </div>

      <div className="flex flex-col gap-1 px-3 pb-4">
        <Grupos grupos={grupos} ruta={ruta} plegados={plegados} alternar={alternar} />
      </div>
    </nav>
  );
}

/** Cajón de móvil. Se cierra solo al navegar. */
export function MenuMovil({ grupos }: { grupos: GrupoNav[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = React.useState(false);
  const { plegados, alternar } = usePlegados();

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
        <SheetBody className="flex flex-col gap-1 p-3">
          <Grupos
            grupos={grupos}
            ruta={ruta}
            plegados={plegados}
            alternar={alternar}
            onNavegar={() => setAbierto(false)}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
