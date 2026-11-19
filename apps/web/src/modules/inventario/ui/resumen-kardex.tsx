import { resumenKardex } from "../api/consultas";
import type { FiltrosKardex } from "../dominio/tipos";

const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const usd = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * Los totales de lo filtrado, encima de la tabla (19/11).
 *
 * Un kardex de verdad se lee como «saldo anterior + entradas − salidas =
 * saldo final». Con UN producto puesto salen los cuatro; con varios, los
 * saldos no se suman (tres rodamientos y dos metros de cadena no son cinco
 * de nada), así que salen los movimientos, los productos y lo que entró y
 * salió, en cantidad y al costo.
 */
export async function ResumenDelKardex({ filtros }: { filtros: FiltrosKardex }) {
  const r = await resumenKardex(filtros);
  if (!r.ok || r.datos.movimientos === 0) return null;
  const d = r.datos;

  const tarjetas: { etiqueta: string; valor: string; detalle?: string; tono?: string }[] = [];
  if (d.saldoInicial !== null) {
    tarjetas.push({ etiqueta: "Saldo al empezar", valor: cant(d.saldoInicial) });
  } else {
    tarjetas.push({ etiqueta: "Movimientos", valor: cant(d.movimientos), detalle: `${cant(d.productos)} productos` });
  }
  tarjetas.push(
    { etiqueta: "Entró", valor: `+${cant(d.entradas)}`, detalle: usd(d.valorEntradas), tono: "text-[var(--ok)]" },
    { etiqueta: "Salió", valor: `−${cant(d.salidas)}`, detalle: usd(d.valorSalidas) },
  );
  if (d.saldoFinal !== null) {
    tarjetas.push({ etiqueta: "Saldo al terminar", valor: cant(d.saldoFinal), detalle: `${cant(d.movimientos)} movimientos` });
  }

  return (
    <dl className="mx-4 mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <dt className="text-sm text-[var(--fg-muted)]">{t.etiqueta}</dt>
          <dd className={`tabular text-lg font-semibold ${t.tono ?? ""}`}>{t.valor}</dd>
          {t.detalle ? <dd className="tabular text-sm text-[var(--fg-subtle)]">{t.detalle}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
