"use client";

// Cliente por el menú desplegable de Radix. El cierre de sesión va por Server
// Action: traer el SDK de Supabase al navegador solo para eso lo metería en
// el bundle de TODAS las páginas del ERP, que es donde vive este menú.

import type { Rol } from "@rodatech/config";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";
import { cerrarSesion } from "@/app/login/acciones";

const ETIQUETA_ROL: Record<Rol, string> = {
  gerencia: "Gerencia",
  admin: "Administración",
  ventas: "Ventas",
  almacen: "Almacén",
  compras: "Compras",
  cobranzas: "Cobranzas",
};

export function MenuUsuario({
  nombre,
  rol,
}: {
  nombre: string;
  rol: Rol | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="subtle" className="gap-2">
          <span className="max-w-40 truncate">{nombre}</span>
          {rol ? (
            <span className="text-xs text-[var(--fg-subtle)]">
              {ETIQUETA_ROL[rol]}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{nombre}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Un <form> con action de servidor: funciona incluso sin JavaScript,
            y no arrastra el SDK de Supabase al bundle. */}
        <form action={cerrarSesion}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full text-left">
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
