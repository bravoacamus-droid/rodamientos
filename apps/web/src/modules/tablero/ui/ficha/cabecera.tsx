import { FiltroRango } from "@/modules/reportes";

import type { FiltrosEjecutivo } from "../ejecutivo/piezas";

/**
 * La cabecera del historial de una ficha (134): su título y el periodo, con
 * los mismos atajos que los reportes. Por defecto, los últimos 12 meses.
 */
export function CabeceraHistorial({ id, titulo, f }: { id: string; titulo: string; f: FiltrosEjecutivo }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {titulo}
      </h2>
      <FiltroRango desde={f.rango.desde} hasta={f.rango.hasta} grano={f.rango.grano} atajo={f.atajo} />
    </div>
  );
}
