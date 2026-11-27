import Link from "next/link";
import { ArrowRight, MapPinOff } from "lucide-react";
import { buttonVariants, cn } from "@rodatech/ui";

import { RodamientoMarca } from "@/componentes/marca-rodatech";

/**
 * La página que no existe.
 *
 * 27/11 — con el lenguaje del login y del tablero: el azul de la marca, la
 * barra dorada y el rodamiento de fondo. Era un «404» gris en letra de
 * máquina y un botón pequeño; a quien llega aquí por un enlace viejo lo que
 * le sirve es saber que no rompió nada y tener a mano la vuelta.
 */
export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <section className="fondo-marca relative w-full max-w-xl overflow-hidden rounded-2xl px-6 py-10 text-center elev-3 sm:px-10">
        <RodamientoMarca
          bolas="currentColor"
          className="pointer-events-none absolute -right-20 -top-20 -z-10 size-72 text-white/10"
        />
        <div className="flex flex-col items-center gap-5">
          <span
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-2xl bg-white/12 text-accent-300 ring-1 ring-inset ring-white/25 [&_svg]:size-8"
          >
            <MapPinOff />
          </span>
          <span className="h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Esta página no existe</h1>
          <p className="max-w-md text-base leading-relaxed text-white/85">
            Puede que la dirección esté mal escrita, o que el módulo todavía no
            esté construido. No se ha perdido nada.
          </p>
          <Link
            href="/dashboard"
            // El dorado sobre el azul, como el «Entrar» del login.
            className={cn(buttonVariants({ variant: "accent", size: "lg" }))}
          >
            Ir al tablero
            <ArrowRight aria-hidden="true" />
          </Link>
          <p className="text-sm font-semibold text-white/75">Error 404</p>
        </div>
      </section>
    </main>
  );
}
