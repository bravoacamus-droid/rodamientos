import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Package, PiggyBank, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { FiltroRango, etiquetaPeriodo } from "@/modules/reportes";

import { datosCompras, proveedoresConCompras } from "../../api/ejecutivo";
import { FRASE_COMPARACION } from "../../dominio/ejecutivo";
import { FiltroComparar, FiltroProveedor } from "./filtros";
import { GraficoBarras } from "./grafico-lazy";
import {
  BotonExcel,
  Bloque,
  Dato,
  Partes,
  Ranking,
  dinero,
  entero,
  hoyEnLima,
  leerFiltros,
  pct,
  uno,
  type ParamsBusqueda,
} from "./piezas";

/**
 * Reporte · Compras (133).
 *
 * Luis, 15/10: *«falta reportes amplio de compras… por productos, ranking de
 * los productos más comprados, cuál fue el mejor proveedor con el mejor
 * precio, etc., algo total que ayude a Willy a ver mejor gráficos e
 * información de compras»*.
 *
 * Las preguntas de quien compra, en su orden: cuánto y por qué vía; cuánto
 * cuesta importar; a quién se le compra y cuánto tarda; qué se compra más;
 * quién lo deja más barato y cuánto se habría ahorrado; qué subió; y qué
 * falta que llegue. Todo en dólares y sin IGV.
 */

const VIAS: { clave: string; texto: string; color: string }[] = [
  { clave: "local", texto: "Compra local", color: "var(--viz-1)" },
  { clave: "aerea", texto: "Importación aérea", color: "var(--viz-3)" },
  { clave: "maritima", texto: "Importación marítima", color: "var(--viz-5)" },
  { clave: "importacion", texto: "Importación (sin vía)", color: "var(--color-steel-400)" },
];

const ROLES = ["gerencia", "admin", "compras"];

export default async function PaginaComprasEjecutiva({ searchParams }: { searchParams: Promise<ParamsBusqueda> }) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return <EstadoError titulo="Tu rol no ve el reporte de compras" mostrarReintentar={false} />;
  }

  const sp = await searchParams;
  const hoy = hoyEnLima();
  const f = leerFiltros(sp, hoy);
  const frase = FRASE_COMPARACION[f.comparar];
  const proveedor = uno(sp.proveedor) ?? null;
  const lista = await proveedoresConCompras();
  const proveedores = lista.ok ? lista.datos : [];
  const nombreProveedor = proveedor ? (proveedores.find((p) => p.id === proveedor)?.nombre ?? null) : null;

  const filtro = (
    <FiltroRango
      desde={f.rango.desde}
      hasta={f.rango.hasta}
      grano={f.rango.grano}
      atajo={f.atajo}
      extra={
        <>
          <FiltroComparar valor={f.comparar} />
          <FiltroProveedor valor={proveedor} proveedores={proveedores} />
        </>
      }
    />
  );

  const [actual, previo] = await Promise.all([
    datosCompras(f.rango, proveedor),
    f.hayComparacion ? datosCompras({ ...f.previo, grano: f.rango.grano }, proveedor) : Promise.resolve(null),
  ]);

  if (!actual.ok) {
    return (
      <>
        {filtro}
        <EstadoError titulo="No se pudieron cargar las compras" detalle={actual.error} />
      </>
    );
  }

  const a = actual.datos;
  const r = a.resumen;
  const rp = previo?.ok ? previo.datos.resumen : undefined;
  const comparar = f.hayComparacion && rp !== undefined;
  const pctGastos = r.importado > 0 ? (r.gastosImportacion / r.importado) * 100 : null;

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
  const montoVia = (k: string) => a.porVia.find((v) => v.via === k)?.monto ?? 0;
  const gastosVia = (k: string) => a.porVia.find((v) => v.via === k)?.gastos ?? 0;

  return (
    <div className="@container flex flex-col gap-5">
      {filtro}

      <BotonExcel
        tipo="compras"
        sp={sp}
        explicacion={`Cada producto de cada compra de este periodo${nombreProveedor ? ` a ${nombreProveedor}` : ""}, en dólares, con su proveedor, su vía y su factura. Trae también las hojas por proveedor, por producto y del mejor precio.`}
      />

      {/* Lo que hay hoy en la base: que no se lea como un fallo. */}
      {r.compras < 5 ? (
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-base">
          Hay <strong>{entero(r.compras)}</strong> {r.compras === 1 ? "compra" : "compras"} en este periodo. Las compras
          del sistema anterior no se cargaron: este reporte se llena con cada compra que se registra en el ERP.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Comprado"
          icono={<ShoppingCart aria-hidden="true" />}
          valor={dinero(r.comprado)}
          detalle="sin IGV, sin las anuladas"
          actual={r.comprado}
          previo={comparar ? rp.comprado : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.local + x.aerea + x.maritima)}
          href="/compras"
        />
        <KpiCard
          etiqueta="Compras"
          icono={<Package aria-hidden="true" />}
          valor={entero(r.compras)}
          detalle={`a ${entero(r.proveedores)} ${r.proveedores === 1 ? "proveedor" : "proveedores"} · ${entero(r.productos)} ${r.productos === 1 ? "producto" : "productos"}`}
          actual={r.compras}
          previo={comparar ? rp.compras : undefined}
          etiquetaComparacion={frase}
        />
        <KpiCard
          etiqueta="Importar cuesta"
          icono={<Truck aria-hidden="true" />}
          valor={pctGastos === null ? "—" : pct(pctGastos, 1)}
          detalle={
            pctGastos === null
              ? "sin importaciones en este periodo"
              : `${dinero(r.gastosImportacion)} de flete y aduana sobre ${dinero(r.importado)}`
          }
        />
        <KpiCard
          etiqueta="Tardan en llegar"
          icono={<Clock aria-hidden="true" />}
          valor={r.diasEntrega === null ? "—" : `${r.diasEntrega.toLocaleString("es-PE")} días`}
          detalle={r.diasEntrega === null ? "ninguna recibida todavía" : "de la compra a la recepción, en promedio"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-5">
        <Bloque
          className="@4xl:col-span-3"
          titulo="Lo comprado, por vía"
          descripcion="Por periodo, sin IGV. Cada color es cómo llegó la mercadería."
        >
          {r.compras === 0 ? (
            <p className="py-10 text-center text-base text-[var(--fg-muted)]">No hay compras en este periodo.</p>
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

        <Bloque className="@4xl:col-span-2" titulo="Por vía" descripcion="Cuánto se compró por cada camino, y lo que costó traerlo.">
          <Partes
            partes={VIAS.filter((v) => montoVia(v.clave) > 0).map((v) => ({
              clave: v.clave,
              texto: gastosVia(v.clave) > 0 ? `${v.texto} · gastos ${dinero(gastosVia(v.clave))}` : v.texto,
              valor: montoVia(v.clave),
              color: v.color,
              cifra: dinero(montoVia(v.clave)),
            }))}
            vacio="No hay compras en este periodo."
          />
        </Bloque>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Dato etiqueta="Unidades compradas" valor={entero(r.unidades)} />
        <Dato
          etiqueta="Por recibir hoy"
          valor={`${entero(r.porRecibir)} · ${dinero(r.montoPorRecibir)}`}
          tono={r.porRecibir > 0 ? "warn" : undefined}
        />
        <Dato
          etiqueta="Órdenes sin registrar la compra"
          valor={entero(r.sinRegistrar)}
          tono={r.sinRegistrar > 0 ? "warn" : "ok"}
        />
        <Dato
          etiqueta="Se pudo ahorrar"
          valor={dinero(r.ahorroPosible)}
          tono={r.ahorroPosible > 0 ? "danger" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque titulo="A quién se le compra" descripcion="Por monto. Con lo que tarda cada uno en entregar.">
          <Ranking
            filas={a.proveedores.map((x) => ({
              clave: x.id,
              nombre: x.proveedor,
              detalle: [
                `${entero(x.compras)} ${x.compras === 1 ? "compra" : "compras"}`,
                r.comprado > 0 ? `${pct((x.monto / r.comprado) * 100)} del total` : null,
                x.diasEntrega === null ? "sin recibir aún" : `entrega en ${x.diasEntrega.toLocaleString("es-PE")} días`,
              ]
                .filter(Boolean)
                .join(" · "),
              valor: x.monto,
              cifra: dinero(x.monto),
              href: `/proveedores/${x.id}`,
            }))}
            vacio="No hay compras en este periodo."
          />
        </Bloque>

        <Bloque titulo="Lo que más se compra" descripcion="Por monto, con su costo promedio y cuántos proveedores lo vendieron.">
          <Ranking
            color="var(--viz-3)"
            filas={a.productos.map((x) => ({
              clave: x.id,
              nombre: x.codigo,
              detalle: [
                x.marca,
                `${entero(x.unidades)} uds.`,
                `${entero(x.veces)} ${x.veces === 1 ? "vez" : "veces"}`,
                `costo prom. ${dinero(x.costoPromedio)}`,
                x.proveedores > 1 ? `${x.proveedores} proveedores` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              valor: x.monto,
              cifra: dinero(x.monto),
              href: `/productos/${x.id}`,
            }))}
            vacio="No hay compras en este periodo."
          />
        </Bloque>
      </div>

      <Bloque
        titulo="Quién lo deja más barato"
        descripcion="Productos con más de un proveedor conocido: el último costo de cada uno, de cada compra y cada respuesta de precios. Primero, donde más distancia hay."
      >
        {a.mejorPrecio.length === 0 ? (
          <p className="py-6 text-center text-base text-[var(--fg-muted)]">
            Todavía no hay productos con dos proveedores para comparar.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {a.mejorPrecio.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 py-3 @3xl:flex-row @3xl:items-center @3xl:gap-4">
                <div className="min-w-0 @3xl:w-1/3">
                  <Link href={`/productos/${x.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                    {x.codigo}
                  </Link>
                  <p className="truncate text-sm text-[var(--fg-muted)]">{x.descripcion}</p>
                </div>
                <p className="min-w-0 flex-1 text-sm">
                  <PiggyBank className="mr-1 inline size-4 align-[-3px] text-[var(--ok)]" aria-hidden="true" />
                  <strong>{x.proveedorMejor}</strong> a <strong className="tabular">{dinero(x.mejor)}</strong>
                  <span className="block text-[var(--fg-muted)]">
                    el más caro: {x.proveedorPeor} a <span className="tabular">{dinero(x.peor)}</span>
                  </span>
                </p>
                <span className="tabular text-base font-semibold text-[var(--danger)] @3xl:w-28 @3xl:text-right">
                  +{pct(x.diferencia, 1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque titulo="Lo que subió" descripcion="La última compra de cada producto contra la anterior, en este periodo.">
          {a.alzas.length === 0 ? (
            <p className="py-6 text-center text-base text-[var(--fg-muted)]">Nada subió de costo en este periodo.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {a.alzas.map((x) => (
                <li key={x.codigo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0">
                    <span className="font-mono font-semibold">{x.codigo}</span>
                    <span className="block truncate text-sm text-[var(--fg-muted)]">
                      de {dinero(x.anterior)} a {dinero(x.ultimo)} · {formatearFecha(x.fecha)}
                    </span>
                  </span>
                  <span className="tabular inline-flex items-center gap-1 text-base font-semibold text-[var(--danger)]">
                    <TrendingUp className="size-4" aria-hidden="true" />+{pct(x.variacion, 1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque
          titulo="Lo que falta"
          descripcion="Hoy, sin importar el periodo: compras por recibir y órdenes sin registrar."
          accion={{ href: "/compras", texto: "Ver compras" }}
        >
          {a.pendientes.length === 0 ? (
            <p className="py-6 text-center text-base text-[var(--fg-muted)]">Todo lo comprado ya llegó.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {a.pendientes.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{x.proveedor}</p>
                    <p className="text-sm text-[var(--fg-muted)]">
                      <span className="font-mono">{x.numero}</span> ·{" "}
                      {x.faltaFactura ? "orden sin registrar la compra" : "por recibir"} · hace {entero(x.dias)} días
                    </p>
                  </div>
                  <span className="tabular font-semibold">{dinero(x.monto)}</span>
                  <Link
                    href={x.faltaFactura ? `/compras/${x.id}/factura` : `/compras/${x.id}`}
                    className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
                  >
                    {x.faltaFactura ? "Registrar compra" : "Abrir"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  );
}
