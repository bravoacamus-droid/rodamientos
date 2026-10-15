import Link from "next/link";
import { Clock, Package, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";

import { etiquetaPeriodo } from "@/modules/reportes";

import { comprasDelProveedor, datosCompras } from "../../api/ejecutivo";
import { GraficoBarras } from "../ejecutivo/grafico-lazy";
import { Bloque, Ranking, dinero, entero, hoyEnLima, leerFiltros, pct, type ParamsBusqueda } from "../ejecutivo/piezas";
import { CabeceraHistorial } from "./cabecera";

const VIA: Record<string, string> = { local: "Local", aerea: "Aérea", maritima: "Marítima", importacion: "Importación" };

function estadoDe(c: { estado: string; faltaFactura: boolean }) {
  if (c.faltaFactura && c.estado === "registrada") return { texto: "Falta registrar", tono: "font-medium text-[var(--warn)]" };
  if (c.estado === "registrada") return { texto: "Por recibir", tono: "" };
  if (c.estado === "recibida_parcial") return { texto: "Recibida en parte", tono: "" };
  return { texto: "Recibida", tono: "text-[var(--ok)]" };
}

/**
 * El historial del proveedor (134): lo que se le compró en el periodo, cómo
 * llegó, cuánto tarda, qué se le compra, qué subió y sus compras una a una.
 * Luis, 15/10: *«me llevó a un módulo donde puedo ver los productos y lo que
 * se compró, pero falta filtros, mejora de UI/UX»*.
 */
export async function HistorialProveedor({ id, sp }: { id: string; sp: ParamsBusqueda }) {
  const f = leerFiltros(sp, hoyEnLima());
  const [r, compras] = await Promise.all([datosCompras(f.rango, id), comprasDelProveedor(id, f.rango)]);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el historial" detalle={r.error} />;
  const a = r.datos;
  const s = a.resumen;

  const porPeriodo = new Map(a.serie.map((p) => [p.periodo.slice(0, 10), p]));
  const serie = f.periodos.map((periodo) => {
    const p = porPeriodo.get(periodo);
    return {
      etiqueta: etiquetaPeriodo(periodo, f.rango.grano),
      local: p?.local ?? 0,
      aerea: p?.aerea ?? 0,
      maritima: p?.maritima ?? 0,
    };
  });

  return (
    <section className="@container flex flex-col gap-4" aria-labelledby="historial-proveedor">
      <CabeceraHistorial id="historial-proveedor" titulo="Lo que se le ha comprado" f={f} />

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Comprado"
          icono={<ShoppingCart aria-hidden="true" />}
          valor={dinero(s.comprado)}
          detalle="sin IGV, en dólares"
          serie={a.serie.map((x) => x.local + x.aerea + x.maritima)}
        />
        <KpiCard
          etiqueta="Compras"
          icono={<Package aria-hidden="true" />}
          valor={entero(s.compras)}
          detalle={`${entero(s.productos)} ${s.productos === 1 ? "producto" : "productos"} · ${entero(s.unidades)} uds.`}
        />
        <KpiCard
          etiqueta="Tarda en entregar"
          icono={<Clock aria-hidden="true" />}
          valor={s.diasEntrega === null ? "—" : `${s.diasEntrega.toLocaleString("es-PE")} días`}
          detalle={s.diasEntrega === null ? "ninguna recibida en el periodo" : "de la compra a la recepción"}
        />
        <KpiCard
          etiqueta="Pendiente hoy"
          icono={<Truck aria-hidden="true" />}
          valor={dinero(s.montoPorRecibir)}
          detalle={`${entero(s.porRecibir)} por recibir · ${entero(s.sinRegistrar)} órdenes sin registrar`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-5">
        <Bloque className="@4xl:col-span-3" titulo="Por mes" descripcion="Lo comprado, sin IGV, según cómo llegó.">
          {s.compras === 0 ? (
            <p className="py-10 text-center text-base text-[var(--fg-muted)]">No se le compró nada en este periodo.</p>
          ) : (
            <GraficoBarras
              datos={serie}
              series={[
                { clave: "local", nombre: "Local", color: "var(--viz-1)", apilado: true },
                { clave: "aerea", nombre: "Aérea", color: "var(--viz-3)", apilado: true },
                { clave: "maritima", nombre: "Marítima", color: "var(--viz-5)", apilado: true },
              ]}
            />
          )}
        </Bloque>
        <Bloque className="@4xl:col-span-2" titulo="Lo que se le compra" descripcion="Por monto, con su costo promedio.">
          <Ranking
            color="var(--viz-3)"
            filas={a.productos.map((x) => ({
              clave: x.id,
              nombre: x.codigo,
              detalle: `${entero(x.unidades)} uds. · costo prom. ${dinero(x.costoPromedio)}`,
              valor: x.monto,
              cifra: dinero(x.monto),
              href: `/productos/${x.id}`,
            }))}
            vacio="No se le compró nada en este periodo."
          />
        </Bloque>
      </div>

      {a.alzas.length > 0 ? (
        <Bloque titulo="Lo que nos subió" descripcion="Su última compra de cada producto contra la anterior.">
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {a.alzas.map((x) => (
              <li key={x.codigo} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <span>
                  <span className="font-mono font-semibold">{x.codigo}</span>
                  <span className="block text-sm text-[var(--fg-muted)]">
                    de {dinero(x.anterior)} a {dinero(x.ultimo)} · {formatearFecha(x.fecha)}
                  </span>
                </span>
                <span className="tabular inline-flex items-center gap-1 font-semibold text-[var(--danger)]">
                  <TrendingUp className="size-4" aria-hidden="true" />+{pct(x.variacion, 1)}
                </span>
              </li>
            ))}
          </ul>
        </Bloque>
      ) : null}

      <Bloque titulo="Sus compras" descripcion="Una por fila, las últimas primero. Toca el número para abrirla.">
        {!compras.ok ? (
          <EstadoError titulo="No se pudieron cargar sus compras" detalle={compras.error} />
        ) : compras.datos.length === 0 ? (
          <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ninguna compra en este periodo.</p>
        ) : (
          <>
            <div className="scroll-x hidden @3xl:block">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-left text-sm text-[var(--fg-muted)]">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Compra</th>
                    <th className="px-3 py-2 font-semibold">Vía</th>
                    <th className="px-3 py-2 font-semibold">Factura</th>
                    <th className="px-3 py-2 font-semibold">Productos</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    <th className="py-2 pl-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {compras.datos.map((c) => {
                    const e = estadoDe(c);
                    return (
                      <tr key={c.id} className="align-top">
                        <td className="tabular whitespace-nowrap py-2.5 pr-3">{formatearFecha(c.fecha)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <Link href={`/compras/${c.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                            {c.numero}
                          </Link>
                          {c.pedido ? (
                            <Link href={`/pedidos/${c.pedido.id}`} className="block font-mono text-[var(--fg-subtle)] hover:underline">
                              {c.pedido.numero}
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">{VIA[c.via] ?? c.via}</td>
                        <td className="px-3 py-2.5 font-mono">{c.factura ?? "—"}</td>
                        <td className="max-w-xs px-3 py-2.5 text-[var(--fg-muted)]">{c.productos}</td>
                        <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-semibold">{dinero(c.totalUsd)}</td>
                        <td className={`whitespace-nowrap py-2.5 pl-3 ${e.tono}`}>{e.texto}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-2 @3xl:hidden">
              {compras.datos.map((c) => {
                const e = estadoDe(c);
                return (
                  <li key={c.id} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/compras/${c.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                        {c.numero}
                      </Link>
                      <span className="tabular font-semibold">{dinero(c.totalUsd)}</span>
                    </div>
                    <p className="text-sm text-[var(--fg-muted)]">
                      {formatearFecha(c.fecha)} · {VIA[c.via] ?? c.via}
                      {c.factura ? ` · factura ${c.factura}` : ""}
                    </p>
                    <p className="text-sm">{c.productos}</p>
                    <p className={`text-sm ${e.tono}`}>{e.texto}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Bloque>
    </section>
  );
}
