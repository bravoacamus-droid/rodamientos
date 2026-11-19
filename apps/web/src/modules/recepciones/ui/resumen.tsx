import { KpiCard } from "@rodatech/ui";

import { recepcionesParaExportar } from "../api/consultas";
import { totalesRecepciones } from "../api/exportar";
import type { FiltrosRecepciones } from "../dominio/tipos";

const dinero = (n: number, moneda: "USD" | "PEN") =>
  `${moneda === "PEN" ? "S/" : "$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Los totales de lo filtrado (19/11): cuántas recepciones, cuántas líneas y
 * cuánto entró, en dólares y en soles por separado (sumarlos sería inventar
 * un tipo de cambio). Las anuladas se cuentan pero no suman.
 *
 * Dentro del panel azul de la cabecera, como en Inventario y el kardex (Luis,
 * 19/11): lo que entró se lee antes que la lista. Son de lo FILTRADO, así que
 * cambian con los filtros de abajo.
 */
export async function ResumenRecepciones({ filtros }: { filtros: FiltrosRecepciones }) {
  const r = await recepcionesParaExportar(filtros);
  if (!r.ok || r.datos.filas.length === 0) return null;
  const t = totalesRecepciones(r.datos.filas);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        etiqueta="Recepciones"
        valor={t.recepciones.toLocaleString("es-PE")}
        detalle={t.anuladas ? `${t.lineas} líneas · ${t.anuladas} anuladas, no suman` : `${t.lineas} líneas`}
      />
      <KpiCard etiqueta="Entró en dólares" valor={dinero(t.usd, "USD")} detalle="sin IGV" />
      <KpiCard etiqueta="Entró en soles" valor={dinero(t.pen, "PEN")} detalle="sin IGV" />
    </div>
  );
}
