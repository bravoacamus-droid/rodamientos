import { EstadoVacio, KpiCard } from "@rodatech/ui";

import { kpisDesdeSerie, ventasMensuales } from "../api/consultas";
// Recharts entra por carga diferida a través de este envoltorio: son ~90 kB
// que no tienen por qué viajar en el bundle inicial de un ERP que se abre
// decenas de veces al día. En la demo se importaba estáticamente.
import { GraficoVentasLazy } from "./grafico-lazy";

const dolares = (n: number) =>
  n.toLocaleString("es-PE", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export async function SeccionVentas() {
  const resultado = await ventasMensuales();
  const meses = resultado.ok ? resultado.datos : [];
  const k = kpisDesdeSerie(meses);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta="Venta del mes"
          valor={dolares(k.ventaNeta)}
          actual={k.ventaNeta}
          previo={k.ventaNetaPrevia}
          etiquetaComparacion="vs. mes anterior"
          serie={k.serie}
          detalle="neta, sin IGV"
        />
        <KpiCard
          etiqueta="Margen del mes"
          valor={dolares(k.margen)}
          actual={k.margen}
          previo={k.margenPrevio}
          etiquetaComparacion="vs. mes anterior"
          detalle={`${k.margenPct.toFixed(1)}% sobre el costo`}
        />
        <KpiCard
          etiqueta="Comprobantes"
          valor={k.documentos.toLocaleString("es-PE")}
          detalle="emitidos este mes"
        />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={dolares(k.documentos > 0 ? k.ventaNeta / k.documentos : 0)}
          detalle="venta / comprobantes"
        />
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Venta y margen · 12 meses</h2>
        {meses.length > 0 ? (
          <GraficoVentasLazy meses={meses} />
        ) : (
          <EstadoVacio
            titulo="Todavía no hay ventas"
            descripcion="El gráfico se llena solo conforme se emitan comprobantes."
          />
        )}
      </section>
    </div>
  );
}
