import { KpiCard } from "@rodatech/ui";

import { resumenInventario } from "../api/consultas";

/**
 * Los cuatro números de la cabecera del inventario.
 *
 * Va en su propio Suspense para no retrasar las tablas. Si falla, se muestran
 * en cero y no un aviso: el error ya lo va a dar la tabla de justo debajo, y
 * duplicarlo hace que el diseño se lea roto.
 */
export async function ResumenInventario() {
  const resultado = await resumenInventario();
  const r = resultado.ok
    ? resultado.datos
    : {
        valorCosto: 0,
        valorVenta: 0,
        margenPotencial: 0,
        unidades: 0,
        skus: 0,
        skusConStock: 0,
      };

  const dinero = (n: number) =>
    n.toLocaleString("es-PE", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        etiqueta="Valor a costo"
        valor={dinero(r.valorCosto)}
        detalle="lo que costó lo que hay"
      />
      <KpiCard
        etiqueta="Valor a venta"
        valor={dinero(r.valorVenta)}
        detalle="si se vendiera todo a lista"
      />
      <KpiCard
        etiqueta="Margen potencial"
        valor={dinero(r.margenPotencial)}
        detalle="la diferencia entre los dos"
      />
      <KpiCard
        etiqueta="Unidades"
        valor={r.unidades.toLocaleString("es-PE")}
        detalle={`en ${r.skusConStock.toLocaleString("es-PE")} de ${r.skus.toLocaleString("es-PE")} SKU`}
      />
    </div>
  );
}
