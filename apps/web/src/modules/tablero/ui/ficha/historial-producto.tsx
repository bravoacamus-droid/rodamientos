import Link from "next/link";
import { BadgeDollarSign, PackageMinus, PackagePlus, PiggyBank } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";

import { etiquetaPeriodo } from "@/modules/reportes";

import { datosProducto } from "../../api/ejecutivo";
import { GraficoBarras } from "../ejecutivo/grafico-lazy";
import { Bloque, Ranking, dinero, entero, hoyEnLima, leerFiltros, pct, type ParamsBusqueda } from "../ejecutivo/piezas";
import { CabeceraHistorial } from "./cabecera";

/**
 * El historial del producto (134): cuánto se vendió y se compró, a cuánto se
 * vende y a cuánto se compra, el margen, a quién se le vende y a quién se le
 * compra —con el último costo de cada proveedor, el más barato primero—.
 */
export async function HistorialProducto({ id, sp }: { id: string; sp: ParamsBusqueda }) {
  const f = leerFiltros(sp, hoyEnLima());
  const r = await datosProducto(f.rango, id);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el historial" detalle={r.error} />;
  const a = r.datos;
  const s = a.resumen;

  const porPeriodo = new Map(a.serie.map((p) => [p.periodo.slice(0, 10), p]));
  const serie = f.periodos.map((periodo) => {
    const p = porPeriodo.get(periodo);
    return {
      etiqueta: etiquetaPeriodo(periodo, f.rango.grano),
      vendidas: p?.vendidoUnidades ?? 0,
      compradas: p?.compradoUnidades ?? 0,
    };
  });
  const masBarato = a.proveedores.find((x) => x.ultimoCosto !== null)?.id;
  const estimado =
    s.precioPromedio !== null && s.costoPromedio !== null && s.costoPromedio > 0
      ? Math.round(((s.precioPromedio - s.costoPromedio) / s.costoPromedio) * 1000) / 10
      : null;

  return (
    <section className="@container flex flex-col gap-4" aria-labelledby="historial-producto">
      <CabeceraHistorial id="historial-producto" titulo="Cómo se mueve" f={f} />

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Vendido"
          icono={<PackageMinus aria-hidden="true" />}
          valor={`${entero(s.vendidoUnidades)} uds.`}
          detalle={`${dinero(s.vendido)} a ${entero(s.clientes)} ${s.clientes === 1 ? "cliente" : "clientes"}`}
          serie={a.serie.map((x) => x.vendidoUnidades)}
        />
        <KpiCard
          etiqueta="Comprado"
          icono={<PackagePlus aria-hidden="true" />}
          valor={`${entero(s.compradoUnidades)} uds.`}
          detalle={`${dinero(s.comprado)} a ${entero(s.proveedores)} ${s.proveedores === 1 ? "proveedor" : "proveedores"}`}
          serie={a.serie.map((x) => x.compradoUnidades)}
        />
        <KpiCard
          etiqueta="Se vende a · se compra a"
          icono={<BadgeDollarSign aria-hidden="true" />}
          valor={s.precioPromedio === null ? "—" : dinero(s.precioPromedio)}
          detalle={s.costoPromedio === null ? "sin compras en el periodo" : `se compra a ${dinero(s.costoPromedio)}, en promedio`}
        />
        {/* Sin costo analizado (el histórico no lo tiene), el margen se
            estima con el precio de venta contra el costo de compra del
            periodo, y se dice que es una estimación. */}
        <KpiCard
          etiqueta="Margen"
          icono={<PiggyBank aria-hidden="true" />}
          valor={s.margen !== null ? pct(s.margen, 1) : estimado !== null ? `≈ ${pct(estimado, 1)}` : "—"}
          detalle={
            s.margen !== null
              ? "sobre el costo analizado al cotizar"
              : estimado !== null
                ? "estimado: precio de venta contra costo de compra"
                : "sin costo para calcularlo"
          }
        />
      </div>

      <Bloque titulo="Por mes" descripcion="Unidades vendidas y compradas.">
        {s.vendidoUnidades === 0 && s.compradoUnidades === 0 ? (
          <p className="py-10 text-center text-base text-[var(--fg-muted)]">No se movió en este periodo.</p>
        ) : (
          <GraficoBarras
            datos={serie}
            formato="numero"
            series={[
              { clave: "vendidas", nombre: "Vendidas", color: "var(--viz-3)" },
              { clave: "compradas", nombre: "Compradas", color: "var(--viz-1)" },
            ]}
          />
        )}
      </Bloque>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque titulo="A quién se le vende" descripcion="Por monto, con el precio promedio de cada uno.">
          <Ranking
            filas={a.clientes.map((x) => ({
              clave: x.id,
              nombre: x.cliente,
              detalle: `${entero(x.unidades)} uds. · ${x.precio === null ? "—" : `a ${dinero(x.precio)}`} · última ${formatearFecha(x.ultima)}`,
              valor: x.vendido,
              cifra: dinero(x.vendido),
              href: `/clientes/${x.id}`,
            }))}
            vacio="No se vendió en este periodo."
          />
        </Bloque>

        <Bloque titulo="A quién se le compra" descripcion="El último costo de cada proveedor que lo vende, el más barato primero.">
          {a.proveedores.length === 0 ? (
            <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ningún proveedor conocido todavía.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {a.proveedores.map((x) => (
                <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0">
                    <Link href={`/proveedores/${x.id}`} className="font-semibold text-brand-600 hover:underline">
                      {x.proveedor}
                    </Link>
                    {x.id === masBarato && a.proveedores.length > 1 ? (
                      <span className="ml-2 rounded-sm border border-[var(--ok)] px-1.5 text-sm font-medium text-[var(--ok)]">
                        el más barato
                      </span>
                    ) : null}
                    <span className="block text-sm text-[var(--fg-muted)]">
                      {x.compras > 0
                        ? `${entero(x.unidades ?? 0)} uds. en el periodo a ${dinero(x.costoPromedio ?? 0)}`
                        : "no se le compró en el periodo"}
                      {x.ultimaCompra ? ` · última ${formatearFecha(x.ultimaCompra)}` : ""}
                    </span>
                  </span>
                  <span className="tabular font-semibold">{x.ultimoCosto === null ? "—" : dinero(x.ultimoCosto)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </section>
  );
}
