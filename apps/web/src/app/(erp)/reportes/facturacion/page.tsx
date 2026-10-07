import type { Metadata } from "next";

import { PaginaFacturacionEjecutiva } from "@/modules/tablero";

export const metadata: Metadata = { title: "Lo facturado" };

/**
 * Un reporte con su propia entrada en el menú (07/10). Luis: *«cada uno solo,
 * no así como lo tienes compartido; cada uno con su módulo»*. Hasta entonces
 * eran pestañas del Tablero, bajo /dashboard.
 */
export default function Pagina(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lo facturado</h1>
        <p className="text-base text-[var(--fg-muted)]">Lo facturado por periodo, por cliente y contra el periodo anterior.</p>
      </div>
      <PaginaFacturacionEjecutiva {...props} />
    </div>
  );
}
