import type { Metadata } from "next";

import { PaginaCotizacionesEjecutiva } from "@/modules/tablero";
import { sinPermiso } from "@/lib/permisos";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { PanelModulo } from "@/componentes/panel-modulo";

export const metadata: Metadata = { title: "Cotizado y ganado" };

/**
 * Un reporte con su propia entrada en el menú (07/10). Luis: *«cada uno solo,
 * no así como lo tienes compartido; cada uno con su módulo»*. Hasta entonces
 * eran pestañas del Tablero, bajo /dashboard.
 */
export default async function Pagina(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // «Reportes · Ver» en Configuración › Roles y permisos (143).
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cotizado y ganado</h1>
        <AvisoSinPermiso mensaje={prohibido} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/reportes/cotizaciones">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizado y ganado</h1>
          {/* La barra dorada del login, como el Informe general (27/11). */}
          <span className="mt-2 block h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
          <p className="mt-2 max-w-3xl text-lg text-[var(--fg-muted)]">Cuánto se cotiza, cuánto se gana y qué está en juego.</p>
        </div>
      </PanelModulo>
      <PaginaCotizacionesEjecutiva {...props} />
    </div>
  );
}
