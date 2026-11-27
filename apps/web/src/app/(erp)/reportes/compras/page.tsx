import type { Metadata } from "next";

import { PaginaComprasEjecutiva } from "@/modules/tablero";
import { PanelModulo } from "@/componentes/panel-modulo";

export const metadata: Metadata = { title: "Lo comprado" };

/**
 * El reporte de compras (133), con su entrada propia en el menú como los
 * demás reportes (07/10: *«cada uno solo, con su módulo»*).
 *
 * «Lo comprado», como en el menú: «Compras» es el módulo, y dos pantallas
 * con el mismo nombre hacen dudar a Willy (lib/navegacion.ts, Reportes).
 */
export default function Pagina(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/reportes/compras">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lo comprado</h1>
          {/* La barra dorada del login, como el Informe general (27/11). */}
          <span className="mt-2 block h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
          <p className="mt-2 max-w-3xl text-lg text-[var(--fg-muted)]">
            Cuánto se compra, a quién, qué, quién lo deja más barato y qué falta que llegue.
          </p>
        </div>
      </PanelModulo>
      <PaginaComprasEjecutiva {...props} />
    </div>
  );
}
