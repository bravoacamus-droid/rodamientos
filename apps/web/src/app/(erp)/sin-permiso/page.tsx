import Link from "next/link";

import { AvisoSinPermiso } from "@/componentes/sin-permiso";

export const metadata = { title: "Sin permiso" };

/**
 * Lo que se pinta en vez de una pantalla que el rol no puede ver (21/10).
 *
 * El middleware reescribe aquí sin cambiar la URL, así que la página de
 * verdad no se genera y sus datos no salen del servidor. Normalmente ni se ve
 * este texto: `GuardaVer` lee la URL original y pone el suyo, que es igual.
 */
export default function PaginaSinPermiso() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">No puedes abrir esta pantalla</h1>
      <AvisoSinPermiso mensaje="Tu rol no tiene «Ver» en este módulo. Si lo necesitas, pídeselo a Gerencia: se cambia en Configuración › Roles y permisos." />
      <Link
        href="/dashboard"
        className="inline-flex h-11 w-fit items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        Volver al tablero
      </Link>
    </div>
  );
}
