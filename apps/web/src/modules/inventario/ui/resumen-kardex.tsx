import { KpiCard } from "@rodatech/ui";

import { resumenKardex } from "../api/consultas";
import type { FiltrosKardex } from "../dominio/tipos";

const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
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
 *
 * El historial del sistema anterior (203) va en su PROPIA tarjeta y no se
 * suma a «Entró» y «Salió»: esas filas no movieron el saldo de este sistema,
 * y sumadas, «saldo al empezar + entró − salió» dejaría de dar el saldo al
 * terminar.
 */
export async function ResumenDelKardex({ filtros }: { filtros: FiltrosKardex }) {
  const r = await resumenKardex(filtros);
  if (!r.ok || (r.datos.movimientos === 0 && r.datos.anteriores === 0)) return null;
  const d = r.datos;

  const tarjetas: { etiqueta: string; valor: string; detalle?: string; tono?: string }[] = [];
  if (d.movimientos > 0) {
    if (d.saldoInicial !== null) {
      tarjetas.push({ etiqueta: "Saldo al empezar", valor: cant(d.saldoInicial) });
    } else {
      tarjetas.push({ etiqueta: "Movimientos", valor: cant(d.movimientos), detalle: `${cant(d.productos)} productos` });
    }
    tarjetas.push(
      // Sobre el azul del panel: los verdes y rojos de estado se aclaran para
      // seguir leyéndose (el panel redefine `--ok` y `--danger`).
      { etiqueta: "Entró", valor: `+${cant(d.entradas)}`, detalle: usd(d.valorEntradas), tono: "text-[var(--ok)]" },
      { etiqueta: "Salió", valor: `−${cant(d.salidas)}`, detalle: usd(d.valorSalidas), tono: "text-[var(--danger)]" },
    );
    if (d.saldoFinal !== null) {
      tarjetas.push({ etiqueta: "Saldo al terminar", valor: cant(d.saldoFinal), detalle: `${cant(d.movimientos)} movimientos` });
    }
  }
  if (d.anteriores > 0) {
    tarjetas.push({
      etiqueta: "Sistema anterior",
      valor: `${cant(d.anteriores)} ${d.anteriores === 1 ? "línea" : "líneas"}`,
      // «Entró» y no «compró»: también entran las devoluciones (204).
      detalle: `salió ${cant(d.anterioresSalidas)} · entró ${cant(d.anterioresEntradas)}`,
    });
  }

  // Clases enteras y no armadas: Tailwind solo genera las que lee escritas.
  const columnas =
    tarjetas.length >= 5 ? "lg:grid-cols-5" : tarjetas.length === 3 ? "lg:grid-cols-3" : tarjetas.length <= 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-2 gap-3 ${columnas}`}>
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
