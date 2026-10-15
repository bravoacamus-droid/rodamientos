import { Clock, Package, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";

import { etiquetaPeriodo } from "@/modules/reportes";

import { comprasDelProveedor, datosCompras } from "../../api/ejecutivo";
import { GraficoBarras } from "../ejecutivo/grafico-lazy";
import { Bloque, Ranking, dinero, entero, hoyEnLima, leerFiltros, pct, type ParamsBusqueda } from "../ejecutivo/piezas";
import { CabeceraHistorial } from "./cabecera";
import { ComprasDelProveedorLista } from "./compras-proveedor";

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

      <Bloque
        titulo="Sus compras"
        descripcion="Las de este periodo. Toca el número para abrirla."
        accion={{ href: `/compras?proveedor=${id}`, texto: "Ver en Compras" }}
      >
        {!compras.ok ? (
          <EstadoError titulo="No se pudieron cargar sus compras" detalle={compras.error} />
        ) : (
          <ComprasDelProveedorLista compras={compras.datos} />
        )}
      </Bloque>
    </section>
  );
}
