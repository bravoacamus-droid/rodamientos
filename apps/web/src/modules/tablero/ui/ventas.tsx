import {
  FileText,
  Receipt,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { EstadoError, EstadoVacio, KpiCard } from "@rodatech/ui";

import { describirRango, type Rango } from "@/modules/reportes";

import { kpisDeRango } from "../api/consultas";
import { estadoDelMargen } from "../dominio/margen";
import { periodoEnCurso } from "../dominio/periodo";
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
          icono={<ShoppingBag aria-hidden="true" />}
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
            icono={<TrendingUp aria-hidden="true" />}
            valor="—"
            detalle="Sin costo registrado en estas ventas"
          />
        ) : margen.tipo === "costo_dudoso" ? (
          /*
            El costo está mal, y decirlo es más útil que el porcentaje.

            El 09/09 esta tarjeta enseñaba «USD 31 · 15325.0% sobre el costo»:
            la cuenta era correcta y el dato de partida no —se vendió a 30.85
            un producto con `costo_unitario` en 0.20—. Enseñar la cifra da por
            bueno un costo que no lo es; enseñar esto manda a arreglarlo.

            El enlace va al catálogo: es donde se corrige.
          */
          <KpiCard
            etiqueta="Margen"
            icono={<TriangleAlert aria-hidden="true" />}
            valor="Revisar"
            detalle="El costo de estas ventas no cuadra"
            href="/productos"
          />
        ) : (
          <KpiCard
            etiqueta="Margen"
            icono={<TrendingUp aria-hidden="true" />}
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
        {/* Con enlace: la pregunta que sigue a «142 comprobantes» es «¿cuáles?»,
            y hasta hoy había que ir a buscarlos por el menú. */}
        <KpiCard
          etiqueta="Comprobantes"
          icono={<FileText aria-hidden="true" />}
          valor={k.documentos.toLocaleString("es-PE")}
          detalle={`${k.unidades.toLocaleString("es-PE")} unidades`}
          href="/facturacion"
        />
        <KpiCard
          etiqueta="Ticket promedio"
          icono={<Receipt aria-hidden="true" />}
          valor={dolares(k.documentos > 0 ? k.ventaNeta / k.documentos : 0)}
          detalle="venta / comprobantes"
        />
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Venta y margen · {describirRango(rango, hoy)}
        </h2>
        {/*
          Con un solo periodo no hay gráfico que dibujar.

          El 09/09, con una única factura en el mes, esto era un rectángulo
          vacío de 256 px con un puntito en medio: cinco líneas de rejilla, un
          eje de dólares y ningún dato del que sacar una forma. Un gráfico
          sirve para ver una tendencia, y una tendencia necesita al menos dos
          puntos que comparar.

          Así que se dice el dato y ya. Es lo mismo que hace la guía de
          visualización con un valor único: una cifra, no un gráfico de una
          sola barra.
        */}
        {k.serie.length === 1 ? (
          <p className="py-6 text-center text-sm text-[var(--fg-muted)]">
            Un solo día con ventas en este periodo:{" "}
            <strong className="text-base text-[var(--fg)]">
              {dolares(k.serie[0]!.venta)}
            </strong>{" "}
            el {k.serie[0]!.etiqueta}. Amplía el rango para ver la evolución.
          </p>
        ) : k.serie.length > 1 ? (
          <GraficoVentasLazy
            meses={k.serie}
            // La línea de margen solo se dibuja si el margen significa algo.
            // Con costos falsos sería una curva que miente, y una gráfica se
            // cree sin leer la letra pequeña de al lado.
            mostrarMargen={margen.tipo === "completo" || margen.tipo === "parcial"}
            // Si el último punto es un periodo a medias, se avisa: mirando
            // doce meses un día 9, ese punto son nueve días contra once meses
            // enteros y el gráfico dibuja un desplome que no ha ocurrido.
            ultimoEnCurso={periodoEnCurso(
              k.serie[k.serie.length - 1]!.periodo,
              rango.grano,
              hoy,
            )}
          />
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
