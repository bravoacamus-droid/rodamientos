import type { Metadata } from "next";

import { PaginaClientesEjecutiva } from "@/modules/tablero";
import { sinPermiso } from "@/lib/permisos";
import { AvisoSinPermiso } from "@/componentes/sin-permiso";
import { PanelModulo } from "@/componentes/panel-modulo";

export const metadata: Metadata = { title: "Ventas por cliente" };

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
        <h1 className="text-2xl font-semibold tracking-tight">Ventas por cliente</h1>
        <AvisoSinPermiso mensaje={prohibido} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/reportes/clientes">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas por cliente</h1>
          <p className="text-base text-[var(--fg-muted)]">Quién compra, cuánto y cómo va cada uno contra el periodo anterior.</p>
        </div>
      </PanelModulo>
      <PaginaClientesEjecutiva {...props} />
    </div>
  );
}
