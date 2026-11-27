import { cookies } from "next/headers";
import { Accessibility } from "lucide-react";

import { RodamientoMarca } from "@/componentes/marca-rodatech";
import { COOKIE_ACCESIBILIDAD, leerPreferencias } from "@/lib/accesibilidad";

import { PanelAccesibilidad } from "./panel";

/**
 * /accesibilidad (27/11): la letra, los colores, el contraste y el movimiento.
 *
 * La propuso Luis para Willy, que no ve bien. Está fuera del menú de
 * Configuración a propósito: aquella es de gerencia, y esto lo necesita
 * cualquiera que use el sistema. Se llega desde el botón «Letra y colores»
 * de la barra de arriba, en todas las pantallas, y desde «Mi perfil».
 */
export default async function PaginaAccesibilidad() {
  const inicial = leerPreferencias((await cookies()).get(COOKIE_ACCESIBILIDAD)?.value);

  return (
    <div className="@container mx-auto flex w-full max-w-5xl flex-col gap-5">
      <section className="fondo-marca relative overflow-hidden rounded-2xl px-5 py-6 text-white shadow-[var(--elev-2)] sm:px-8">
        <RodamientoMarca
          bolas="currentColor"
          className="pointer-events-none absolute -right-16 -top-20 size-64 text-white/[0.06]"
        />
        <div className="relative flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-accent-300 ring-1 ring-inset ring-white/20">
            <Accessibility className="size-8" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-white">Letra y colores</h1>
            <span
              className="mt-2 block h-1.5 w-24 -skew-x-[30deg] rounded-sm bg-accent-400"
              aria-hidden="true"
            />
            <p className="mt-2 max-w-2xl text-lg text-white">
              Pon el sistema a tu medida: más grande, con más contraste o sin animaciones. Cada cambio
              se ve al momento.
            </p>
          </div>
        </div>
      </section>

      <PanelAccesibilidad inicial={inicial} />
    </div>
  );
}
