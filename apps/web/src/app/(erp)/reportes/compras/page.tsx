import type { Metadata } from "next";

import { PaginaComprasEjecutiva } from "@/modules/tablero";

export const metadata: Metadata = { title: "Compras" };

/**
 * El reporte de compras (133), con su entrada propia en el menú como los
 * demás reportes (07/10: *«cada uno solo, con su módulo»*).
 */
export default function Pagina(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <p className="text-base text-[var(--fg-muted)]">
          Cuánto se compra, a quién, qué, quién lo deja más barato y qué falta que llegue.
        </p>
      </div>
      <PaginaComprasEjecutiva {...props} />
    </div>
  );
}
