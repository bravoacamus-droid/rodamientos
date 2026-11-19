import { KpiCard } from "@rodatech/ui";

import { resumenKardex } from "../api/consultas";
import type { FiltrosKardex } from "../dominio/tipos";

const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
// «1 producto», «2 productos»: «1 movimientos» se leía como un error.
const contar = (n: number, uno: string, varios: string) => `${cant(n)} ${n === 1 ? uno : varios}`;
// Sin signo cuando es cero: «−0» parecía una salida negativa.
const conSigno = (signo: string, n: number) => (n === 0 ? "0" : `${signo}${cant(n)}`);
const usd = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * Los totales de lo filtrado (19/11).
 *
 * Un kardex de verdad se lee como «saldo anterior + entradas − salidas =
 * saldo final». Con UN producto puesto salen los cuatro; con varios, los
 * saldos no se suman (tres rodamientos y dos metros de cadena no son cinco
 * de nada), así que salen los movimientos, los productos y lo que entró y
 * salió, en cantidad y al costo.
 *
 * Van dentro del panel azul de la cabecera, con las mismas tarjetas de cifras
 * que Inventario (Luis, 19/11: «que arriba salga la información»): el kardex
 * dice lo que movió antes de enseñar la lista. Siguen siendo de lo FILTRADO,
 * así que cambian al cambiar un filtro de abajo.
 */
export async function ResumenDelKardex({ filtros }: { filtros: FiltrosKardex }) {
  const r = await resumenKardex(filtros);
  if (!r.ok || r.datos.movimientos === 0) return null;
  const d = r.datos;

  const tarjetas: { etiqueta: string; valor: string; detalle?: string; tono?: string }[] = [];
  if (d.saldoInicial !== null) {
    tarjetas.push({ etiqueta: "Saldo al empezar", valor: cant(d.saldoInicial) });
  } else {
    tarjetas.push({ etiqueta: "Movimientos", valor: cant(d.movimientos), detalle: contar(d.productos, "producto", "productos") });
  }
  tarjetas.push(
    // Sobre el azul del panel: los verdes y rojos de estado se aclaran para
    // seguir leyéndose (el panel redefine `--ok` y `--danger`).
    { etiqueta: "Entró", valor: conSigno("+", d.entradas), detalle: usd(d.valorEntradas), tono: d.entradas ? "text-[var(--ok)]" : undefined },
    { etiqueta: "Salió", valor: conSigno("−", d.salidas), detalle: usd(d.valorSalidas), tono: d.salidas ? "text-[var(--danger)]" : undefined },
  );
  if (d.saldoFinal !== null) {
    tarjetas.push({ etiqueta: "Saldo al terminar", valor: cant(d.saldoFinal), detalle: contar(d.movimientos, "movimiento", "movimientos") });
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tarjetas.map((t) => (
        <KpiCard
          key={t.etiqueta}
          etiqueta={t.etiqueta}
          valor={t.tono ? <span className={t.tono}>{t.valor}</span> : t.valor}
          detalle={t.detalle}
        />
      ))}
    </div>
  );
}
