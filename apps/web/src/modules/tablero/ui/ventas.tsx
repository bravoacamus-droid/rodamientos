import { EstadoError, EstadoVacio, KpiCard } from "@rodatech/ui";

import { describirRango, type Rango } from "@/modules/reportes";

import { kpisDeRango } from "../api/consultas";
import { estadoDelMargen } from "../dominio/margen";
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

/**
 * Los indicadores del periodo elegido.
 *
 * Antes eran fijos: «el mes en curso» contra «el mes anterior». Willy pidió
 * poder mirar cualquier rango (26/08, 2:00): *«de tal fecha a tal fecha cuánto
 * he vendido»*.
 *
 * La comparación es contra el periodo INMEDIATAMENTE ANTERIOR DE LA MISMA
 * LONGITUD, no contra el mes natural anterior. Mirando «este mes» un día 26 se
 * compara contra 26 días de julio, no contra los 31: comparar 26 días contra
 * 31 diría que se vendió menos aunque se esté vendiendo más por día, y esa es
 * la clase de cifra que hace que nadie vuelva a mirar la comparación.
 */
export async function SeccionVentas({
  rango,
  hoy,
}: {
  rango: Rango;
  hoy: string;
}) {
  const r = await kpisDeRango(rango);
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar los indicadores" detalle={r.error} />;
  }

  const k = r.datos;
  const comparacion = `vs. ${describirRango(rango, hoy) === "hoy" ? "ayer" : "el periodo anterior"}`;
  // La regla vive en `dominio/margen.ts`, donde está probada: qué se puede
  // decir del margen depende de cuánto costo se conozca, y decirlo mal es lo
  // que hacía que el tablero diera la venta entera como ganancia.
  const margen = estadoDelMargen(k.ventaNeta, k.ventaConCosto, k.costo);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta="Vendido"
          valor={dolares(k.ventaNeta)}
          actual={k.ventaNeta}
          previo={k.ventaNetaPrevia}
          etiquetaComparacion={comparacion}
          serie={k.serie.map((p) => p.venta)}
          detalle="neto, sin IGV"
        />
        {/*
          El margen solo significa algo sobre la venta cuyo costo se conoce.

          Los 479 comprobantes del histórico se cargaron SIN costo, así que
          esta tarjeta enseñaba «USD 201,797 · 0.0% sobre el costo»: la venta
          entera como ganancia, con su propia explicación desmintiéndola en la
          línea de abajo. Y no se arregla solo con el tiempo — esos documentos
          nunca van a tener costo, así que todo rango que mire hacia atrás
          mezcla los dos casos para siempre.
        */}
        {margen.tipo === "sin_costo" ? (
          <KpiCard
            etiqueta="Margen"
            valor="—"
            detalle="Sin costo registrado en estas ventas"
          />
        ) : (
          <KpiCard
            etiqueta="Margen"
            valor={dolares(margen.margen)}
            actual={margen.margen}
            previo={k.margenPrevio}
            etiquetaComparacion={comparacion}
            detalle={
              margen.tipo === "parcial"
                ? // Sobre qué parte se calcula, o el número se lee como si
                  // cubriera toda la venta.
                  `${margen.pct.toFixed(1)}% sobre el costo · solo de ${margen.cubrePct}% de la venta`
                : `${margen.pct.toFixed(1)}% sobre el costo`
            }
          />
        )}
        <KpiCard
          etiqueta="Comprobantes"
          valor={k.documentos.toLocaleString("es-PE")}
          detalle={`${k.unidades.toLocaleString("es-PE")} unidades`}
        />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={dolares(k.documentos > 0 ? k.ventaNeta / k.documentos : 0)}
          detalle="venta / comprobantes"
        />
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Venta y margen · {describirRango(rango, hoy)}
        </h2>
        {k.serie.length > 0 ? (
          <GraficoVentasLazy meses={k.serie} />
        ) : (
          <EstadoVacio
            titulo="No hay ventas en este periodo"
            descripcion="Prueba con un rango más amplio, o mira «Todo»."
          />
        )}
      </section>
    </div>
  );
}
