"use client";

// Cliente por el menú desplegable de Radix. El cierre de sesión va por Server
// Action: traer el SDK de Supabase al navegador solo para eso lo metería en
// el bundle de TODAS las páginas del ERP, que es donde vive este menú.

import Link from "next/link";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";
import { Accessibility, LogOut, UserRound } from "lucide-react";
import { cerrarSesion } from "@/app/login/acciones";

/** Las dos primeras iniciales del nombre: «Willy Fernández» → «WF». */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.slice(0, 2).map((p) => p[0] ?? "").join("");
  return letras.toLocaleUpperCase("es-PE") || "?";
}

export function MenuUsuario({
  nombre,
  rol,
}: {
  nombre: string;
  /** El NOMBRE del rol, ya resuelto: puede ser uno creado por gerencia (143). */
  rol: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="subtle" className="gap-2 sm:pl-1.5">
          {/* Sus iniciales en un círculo del azul de la marca (27/11): es la
              forma en que cualquier programa dice «esta es tu cuenta», y le da
              a la esquina de la barra un ancla de color. El nombre sigue al
              lado, que es lo que dice de quién es. En el teléfono no cabe. */}
          <span
            aria-hidden="true"
            className="hidden size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white ring-2 ring-accent-400/70 sm:grid"
          >
            {iniciales(nombre)}
          </span>
          <span className="max-w-28 truncate sm:max-w-40">{nombre}</span>
          {/* En el teléfono el rol no cabe al lado del botón «Menú» y del
              logo (02/11, a 390 px). Sigue dentro del desplegable. */}
          {rol ? (
            <span className="hidden text-sm text-[var(--fg-subtle)] sm:inline">
              {rol}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-[var(--fg)]">{nombre}</span>
          {rol ? (
            <span className="block truncate font-normal text-[var(--fg-muted)]">{rol}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/*
          Mi perfil.

          Luis, 15/09, con la captura del menú abierto: *«falta editar perfil
          para que pueda editar su perfil»*. Aquí solo se podía cerrar sesión,
          así que nadie tenía forma de corregir su propio nombre —el que sale
          en la cabecera y firma sus cotizaciones— ni de cambiar la contraseña
          de desarrollo con la que nacieron las seis cuentas.

          Va ANTES de cerrar sesión y separado de él: son la única acción
          constructiva y la única destructiva del menú, y pegadas se pulsa la
          que no era.
        */}
        <DropdownMenuItem asChild>
          <Link href="/perfil" className="w-full">
            <UserRound className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
            Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/accesibilidad" className="w-full">
            <Accessibility className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
            Letra y colores
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {/* Un <form> con action de servidor: funciona incluso sin JavaScript,
            y no arrastra el SDK de Supabase al bundle. */}
        <form action={cerrarSesion}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full text-left">
              <LogOut className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
