"use client";

// Cliente: sale de la ruta, y la ruta cambia al navegar sin que el layout se
// vuelva a pintar en el servidor.

import { usePathname } from "next/navigation";
import { IconoNav } from "@/componentes/iconos-nav";
import { CONFIGURACION, NAVEGACION, TABLERO, rutaActiva, type GrupoNav, type ItemNav } from "@/lib/navegacion";

/**
 * Dónde estás, en la barra de arriba (27/11).
 *
 * La barra superior era blanca y vacía a la izquierda en escritorio: el logo
 * se esconde desde `md` porque ya está en el menú. Al bajar por una ficha
 * larga —una cotización de treinta líneas— la cabecera del módulo se va con
 * el scroll y no quedaba nada que dijera en qué pantalla se estaba. Esta
 * barra sí se queda pegada arriba, así que es el sitio.
 *
 * Es lo mismo que ya dice el menú —el icono del módulo, el grupo y el
 * nombre—, en el azul de los títulos. No es un enlace: no lleva a ningún
 * sitio nuevo, y algo que parece botón y no hace nada confunde más que ayuda.
 * Desde 1024 px: por debajo, con el menú lateral abierto, «Letra y colores»,
 * el tema y el usuario ya llenan la barra, y en el teléfono ese sitio es del
 * botón «Menú» y el logo. El nombre del grupo, desde 1280.
 */
function buscar(ruta: string): { grupo?: GrupoNav; item?: ItemNav } {
  const grupos = [...NAVEGACION, CONFIGURACION];
  const activa = rutaActiva(ruta, grupos);
  if (!activa) return {};
  if (activa === TABLERO.ruta) return { item: TABLERO };
  for (const grupo of grupos) {
    const item = grupo.items.find((i) => i.ruta === activa);
    if (item) return { grupo, item };
  }
  return {};
}

export function DondeEstoy() {
  const ruta = usePathname();
  const { grupo, item } = buscar(ruta);
  if (!item) return null;

  return (
    <div className="hidden min-w-0 items-center gap-3 lg:flex">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-accent-300 shadow-[var(--elev-1)] dark:bg-brand-800"
      >
        <IconoNav nombre={item.icono} className="size-5" />
      </span>
      <p className="flex min-w-0 items-baseline gap-2 leading-tight">
        {grupo ? (
          <>
            <span className="hidden shrink-0 text-sm font-semibold text-muted xl:inline">{grupo.titulo}</span>
            <span aria-hidden="true" className="hidden text-sm text-muted xl:inline">
              ·
            </span>
          </>
        ) : null}
        <span className="truncate text-base font-bold text-[var(--titulo)]">{item.etiqueta}</span>
      </p>
    </div>
  );
}
