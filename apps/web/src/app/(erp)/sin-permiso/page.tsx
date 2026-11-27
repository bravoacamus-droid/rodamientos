import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { buttonVariants, cn } from "@rodatech/ui";

import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { RodamientoMarca } from "@/componentes/marca-rodatech";

export const metadata = { title: "Sin permiso" };

/**
 * Lo que se pinta en vez de una pantalla que el rol no puede ver (21/10).
 *
 * El middleware reescribe aquí sin cambiar la URL, así que la página de
 * verdad no se genera y sus datos no salen del servidor. Normalmente ni se ve
 * este texto: `GuardaVer` lee la URL original y pone el suyo, que es igual.
 *
 * 27/11 — con el lenguaje del tablero: la tarjeta con el candado en su chip,
 * la barra dorada y el rodamiento de fondo. Era un título suelto con un
 * enlace gris debajo, que se leía como una pantalla rota y no como un «aquí
 * no, y esto es lo que puedes hacer».
 */
export default function PaginaSinPermiso() {
  return (
    <section className="card relative isolate mx-auto mt-4 flex max-w-2xl flex-col gap-5 overflow-hidden p-6 sm:p-8">
      <RodamientoMarca
        bolas="currentColor"
        className="pointer-events-none absolute -right-16 -top-16 -z-10 size-64 text-[var(--border)]"
      />
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-2xl bg-warn-bg text-warn ring-1 ring-inset ring-warn/30 [&_svg]:size-7"
      >
        <Lock />
      </span>
      <div className="flex flex-col gap-3">
        <span className="h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">No puedes abrir esta pantalla</h1>
      </div>
      <AvisoSinPermiso mensaje="Tu rol no tiene «Ver» en este módulo. Si lo necesitas, pídeselo a Gerencia: se cambia en Configuración › Roles y permisos." />
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-fit")}>
        Volver al tablero
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
