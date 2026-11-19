import { recepcionesParaExportar } from "../api/consultas";
import { totalesRecepciones } from "../api/exportar";
import type { FiltrosRecepciones } from "../dominio/tipos";

const dinero = (n: number, moneda: "USD" | "PEN") =>
  `${moneda === "PEN" ? "S/" : "$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Los totales de lo filtrado, encima de la tabla (19/11): cuántas
 * recepciones, cuántas líneas y cuánto entró, en dólares y en soles por
 * separado (sumarlos sería inventar un tipo de cambio). Las anuladas se
 * cuentan pero no suman.
 */
export async function ResumenRecepciones({ filtros }: { filtros: FiltrosRecepciones }) {
  const r = await recepcionesParaExportar(filtros);
  if (!r.ok || r.datos.filas.length === 0) return null;
  const t = totalesRecepciones(r.datos.filas);

  const tarjetas = [
    {
      etiqueta: "Recepciones",
      valor: String(t.recepciones),
      detalle: t.anuladas ? `${t.anuladas} anuladas, no suman` : `${t.lineas} líneas`,
    },
    { etiqueta: "Entró en dólares", valor: dinero(t.usd, "USD"), detalle: "sin IGV" },
    { etiqueta: "Entró en soles", valor: dinero(t.pen, "PEN"), detalle: "sin IGV" },
  ];

  return (
    <dl className="mx-4 mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tarjetas.map((x) => (
        <div key={x.etiqueta} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <dt className="text-sm text-[var(--fg-muted)]">{x.etiqueta}</dt>
          <dd className="tabular text-lg font-semibold">{x.valor}</dd>
          <dd className="text-sm text-[var(--fg-subtle)]">{x.detalle}</dd>
        </div>
      ))}
    </dl>
  );
}
