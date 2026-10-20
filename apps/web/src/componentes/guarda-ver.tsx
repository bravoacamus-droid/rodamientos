"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { puedeAbrir } from "@/lib/navegacion";

import { AvisoSinPermiso } from "./sin-permiso";

/**
 * La puerta de cada pantalla según «Ver» (143). Va en el layout, una vez,
 * en vez de repetirse en las sesenta páginas: lee la ruta y pregunta lo mismo
 * que el menú.
 */
export function GuardaVer({
  rol,
  nombreRol,
  permisos,
  children,
}: {
  rol: string | null;
  nombreRol: string | null;
  permisos: readonly string[];
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  if (puedeAbrir(ruta, rol, permisos)) return <>{children}</>;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">No puedes abrir esta pantalla</h1>
      <AvisoSinPermiso
        mensaje={`${nombreRol ? `Tu rol (${nombreRol})` : "Tu rol"} no tiene «Ver» en este módulo. Si lo necesitas, pídeselo a Gerencia: se cambia en Configuración › Roles y permisos.`}
      />
      <Link href="/dashboard" className="inline-flex h-11 w-fit items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]">
        Volver al tablero
      </Link>
    </div>
  );
}
