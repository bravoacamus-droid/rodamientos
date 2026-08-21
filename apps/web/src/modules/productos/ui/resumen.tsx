import { KpiCard } from "@rodatech/ui";

import { resumenCatalogo } from "../api/consultas";

/**
 * Los cuatro indicadores de la cabecera.
 *
 * Va en su propio Suspense: son cinco consultas agregadas y no deben retrasar
 * la tabla, que es lo que el usuario vino a ver.
 *
 * Si fallan, no se muestra un error — se muestran en cero. Un aviso aquí
 * duplicaría el que ya da la tabla justo debajo, y el diseño se leería roto.
 */
export async function ResumenProductos() {
  const resultado = await resumenCatalogo();
  const r = resultado.ok
    ? resultado.datos
    : { total: 0, sinStock: 0, criticos: 0, sobrestock: 0, valorizado: 0 };

  const dinero = r.valorizado.toLocaleString("es-PE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        etiqueta="SKU activos"
        valor={r.total.toLocaleString("es-PE")}
        detalle="sin contar archivados"
      />
      <KpiCard
        etiqueta="Sin stock"
        valor={r.sinStock.toLocaleString("es-PE")}
        detalle="no se pueden despachar"
      />
      <KpiCard
        etiqueta="Por agotarse"
        valor={r.criticos.toLocaleString("es-PE")}
        detalle="bajo el mínimo"
      />
      <KpiCard
        etiqueta="Inventario valorizado"
        valor={dinero}
        detalle="a costo promedio"
      />
    </div>
  );
}
