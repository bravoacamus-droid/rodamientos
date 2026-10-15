import Link from "next/link";
import { Banknote, ClipboardList, FileText, Target } from "lucide-react";
import { EstadoError, KpiCard, Moneda, formatearFecha } from "@rodatech/ui";

import { etiquetaPeriodo } from "@/modules/reportes";
import { filasDePedidos } from "@/modules/pedidos/api/consultas";
import { cobroDe, margenPct, totalVisible } from "@/modules/pedidos/dominio/lista";
import { InsigniaEtapa } from "@/modules/pedidos/ui/insignia";

import { datosCotizaciones, datosFacturacion, datosVentas } from "../../api/ejecutivo";
import { tasaDeCierre } from "../../dominio/ejecutivo";
import { GraficoBarras } from "../ejecutivo/grafico-lazy";
import { Bloque, Ranking, dinero, entero, hoyEnLima, leerFiltros, pct, type ParamsBusqueda } from "../ejecutivo/piezas";
import { CabeceraHistorial } from "./cabecera";

/**
 * El historial del cliente (134): cuánto se le vendió y se le facturó, cuánto
 * debe, cuánto se le cotiza y cuánto de eso se gana, el margen, lo que más
 * compra y sus pedidos uno a uno. Lo mismo que los reportes, pero de él.
 */
export async function HistorialCliente({ id, sp }: { id: string; sp: ParamsBusqueda }) {
  const f = leerFiltros(sp, hoyEnLima());
  const [ventas, facturas, cotizaciones, pedidos] = await Promise.all([
    datosVentas(f.rango, id),
    datosFacturacion(f.rango, id),
    datosCotizaciones(f.rango, id),
    filasDePedidos({ desde: f.rango.desde, hasta: f.rango.hasta }),
  ]);
  if (!ventas.ok) return <EstadoError titulo="No se pudo cargar el historial" detalle={ventas.error} />;
  const v = ventas.datos.resumen;
  const fr = facturas.ok ? facturas.datos.resumen : null;
  const cr = cotizaciones.ok ? cotizaciones.datos.resumen : null;
  const tasa = cr ? tasaDeCierre(cr) : null;
  const suyos = pedidos.ok ? pedidos.datos.filter((p) => p.clienteId === id) : [];

  const vendidoPor = new Map(ventas.datos.serie.map((p) => [p.periodo.slice(0, 10), p.vendido]));
  const facturadoPor = new Map((facturas.ok ? facturas.datos.serie : []).map((p) => [p.periodo.slice(0, 10), p.venta]));
  const serie = f.periodos.map((periodo) => ({
    etiqueta: etiquetaPeriodo(periodo, f.rango.grano),
    vendido: vendidoPor.get(periodo) ?? 0,
    facturado: facturadoPor.get(periodo) ?? 0,
  }));

  return (
    <section className="@container flex flex-col gap-4" aria-labelledby="historial-cliente">
      <CabeceraHistorial id="historial-cliente" titulo="Lo que se le ha vendido" f={f} />

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Vendido"
          icono={<ClipboardList aria-hidden="true" />}
          valor={dinero(v.vendido)}
          detalle={`${entero(v.ventas)} ${v.ventas === 1 ? "pedido" : "pedidos"}${v.margen === null ? "" : ` · margen ${pct(v.margen, 1)}`}`}
          serie={ventas.datos.serie.map((x) => x.vendido)}
        />
        <KpiCard
          etiqueta="Facturado"
          icono={<FileText aria-hidden="true" />}
          valor={fr ? dinero(fr.venta) : "—"}
          detalle={fr ? `${entero(fr.documentos)} ${fr.documentos === 1 ? "comprobante" : "comprobantes"}, sin IGV` : "no se pudo leer"}
        />
        <KpiCard
          etiqueta="Debe"
          icono={<Banknote aria-hidden="true" />}
          valor={fr ? dinero(fr.saldo) : "—"}
          detalle={fr && fr.vencido > 0 ? `${dinero(fr.vencido)} ya vencido` : "de lo facturado en el periodo"}
          href={`/cobranzas?cliente=${id}`}
        />
        <KpiCard
          etiqueta="Se le gana"
          icono={<Target aria-hidden="true" />}
          valor={pct(tasa)}
          detalle={cr ? `de ${entero(cr.cotizaciones)} ${cr.cotizaciones === 1 ? "cotización" : "cotizaciones"} · ${dinero(cr.monto)} cotizado` : "—"}
          href={`/cotizaciones?cliente=${id}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-5">
        <Bloque className="@4xl:col-span-3" titulo="Por mes" descripcion="Lo vendido (pedidos) y lo facturado, sin IGV.">
          {v.vendido === 0 && (fr?.venta ?? 0) === 0 ? (
            <p className="py-10 text-center text-base text-[var(--fg-muted)]">No se le vendió nada en este periodo.</p>
          ) : (
            <GraficoBarras
              datos={serie}
              series={[
                { clave: "vendido", nombre: "Vendido", color: "var(--viz-3)" },
                { clave: "facturado", nombre: "Facturado", color: "var(--viz-1)" },
              ]}
            />
          )}
        </Bloque>
        <Bloque className="@4xl:col-span-2" titulo="Lo que más compra" descripcion="Por monto facturado en el periodo.">
          <Ranking
            color="var(--viz-3)"
            filas={(facturas.ok ? facturas.datos.topProductos : []).map((x) => ({
              clave: x.codigo,
              nombre: x.codigo,
              detalle: `${x.descripcion} · ${entero(x.unidades)} uds.`,
              valor: x.venta,
              cifra: dinero(x.venta),
            }))}
            vacio="No se le facturó nada en este periodo."
          />
        </Bloque>
      </div>

      <Bloque
        titulo="Sus pedidos"
        descripcion="Cada vez que confirmó, con su total, su margen y en qué va."
        accion={suyos.length > 0 ? { href: `/pedidos?cliente=${id}`, texto: "Ver en Pedidos" } : undefined}
      >
        {suyos.length === 0 ? (
          <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ningún pedido en este periodo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {suyos.map((p) => {
              const m = margenPct(p.venta, p.costo);
              const c = cobroDe(p);
              return (
                <li key={p.id} className="flex flex-col gap-2 py-3 @3xl:flex-row @3xl:items-center @3xl:gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/pedidos/${p.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                      {p.numero}
                    </Link>
                    <span className="ml-2 text-sm text-[var(--fg-muted)]">
                      {p.cotizacion} · {formatearFecha(p.fecha)}
                    </span>
                    <p className="truncate text-sm">{p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="tabular font-semibold">
                      <Moneda valor={totalVisible(p)} moneda={p.moneda} tamano="sm" />
                    </span>
                    <span className="tabular">{m === null ? "sin costo" : `margen ${m.toFixed(1)} %`}</span>
                    <span>{c === "pagado" ? "cobrado" : c === "vencido" ? "vencido" : c === "pendiente" ? "por cobrar" : "sin factura"}</span>
                    <InsigniaEtapa etapa={p.etapa} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Bloque>
    </section>
  );
}
