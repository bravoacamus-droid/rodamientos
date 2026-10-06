import Link from "next/link";
import { Ban, FileMinus, Receipt, ShoppingBag, Users, Wallet, X } from "lucide-react";
import { EstadoError, KpiCard } from "@rodatech/ui";

import { FiltroRango } from "@/modules/reportes";

import { clientesConCompras, datosFacturacion } from "../../api/ejecutivo";
import { FRASE_COMPARACION } from "../../dominio/ejecutivo";
import { FiltroCliente, FiltroComparar } from "./filtros";
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
  serieComparada,
  uno,
  type ParamsBusqueda,
} from "./piezas";

/**
 * Tablero · Facturación.
 *
 * Lo que se emitió y cómo terminó: cuánto se facturó contra el periodo de
 * comparación, cuánto se anuló o se devolvió con nota de crédito, qué parte
 * fue a crédito, qué falta cobrar y cómo está todo con SUNAT.
 *
 * Con el filtro de cliente, la pestaña entera se vuelve «la ficha de ese
 * cliente»: su facturación mes a mes contra el año pasado y lo que se lleva.
 */

const ESTADO_COBRO: Record<string, { texto: string; color: string; orden: number }> = {
  pagado: { texto: "Cobradas", color: "var(--viz-good)", orden: 1 },
  emitido: { texto: "Por cobrar, dentro del plazo", color: "var(--viz-1)", orden: 2 },
  parcial: { texto: "Cobradas en parte", color: "var(--viz-ord-1)", orden: 3 },
  vencido: { texto: "Vencidas sin cobrar", color: "var(--viz-critical)", orden: 4 },
  anulado: { texto: "Anuladas", color: "var(--color-steel-400)", orden: 5 },
};

function conParams(sp: ParamsBusqueda, ruta: string, cambios: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const x = uno(v);
    if (x) q.set(k, x);
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

export default async function PaginaFacturacionEjecutiva({
  searchParams,
}: {
  searchParams: Promise<ParamsBusqueda>;
}) {
  const sp = await searchParams;
  const hoy = hoyEnLima();
  const f = leerFiltros(sp, hoy);
  const cliente = uno(sp.cliente) ?? null;
  const frase = FRASE_COMPARACION[f.comparar];

  const [actual, previo, lista, historia] = await Promise.all([
    datosFacturacion(f.rango, cliente),
    f.hayComparacion
      ? datosFacturacion({ ...f.previo, grano: f.rango.grano }, cliente)
      : Promise.resolve(null),
    clientesConCompras(),
    // Toda la historia por año, sin importar el periodo elegido: es la
    // pregunta de Willy, 06/10 (53:28): «¿de qué año se vendió más?».
    datosFacturacion({ desde: "2020-01-01", hasta: hoy, grano: "anio" }, cliente),
  ]);

  const clientes = lista.ok ? lista.datos : [];
  const nombreCliente = cliente ? clientes.find((c) => c.id === cliente)?.nombre : null;

  const filtro = (
    <FiltroRango
      desde={f.rango.desde}
      hasta={f.rango.hasta}
      grano={f.rango.grano}
      atajo={f.atajo}
      extra={
        <>
          <FiltroComparar valor={f.comparar} />
          <FiltroCliente valor={cliente} clientes={clientes} />
        </>
      }
    />
  );

  if (!actual.ok) {
    return (
      <>
        {filtro}
        <EstadoError titulo="No se pudo cargar la facturación" detalle={actual.error} />
      </>
    );
  }

  const a = actual.datos;
  const p = previo?.ok ? previo.datos : null;
  const r = a.resumen;
  const rp = p?.resumen;
  const ticket = r.documentos > 0 ? r.venta / r.documentos : 0;
  const ticketPrev = rp && rp.documentos > 0 ? rp.venta / rp.documentos : undefined;
  const serie = serieComparada(f, a.serie, p?.serie ?? [], (x) => x.venta);
  const comparar = f.hayComparacion && rp !== undefined;

  return (
    <div className="@container flex flex-col gap-5">
      {filtro}

      {nombreCliente ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950">
          <p className="text-base">
            Mirando solo a <strong>{nombreCliente}</strong>
          </p>
          <Link
            href={conParams(sp, "/dashboard/facturacion", { cliente: null })}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
          >
            <X className="size-4" aria-hidden="true" />
            Ver todos los clientes
          </Link>
        </div>
      ) : null}

      <BotonExcel
        tipo="ventas"
        sp={sp}
        explicacion={`Cada producto de cada factura de este periodo${nombreCliente ? ` de ${nombreCliente}` : ""}, con su cliente, su marca y su familia; las notas de crédito restan. Trae también una hoja por producto y otra por cliente.`}
      />

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Facturado"
          icono={<ShoppingBag aria-hidden="true" />}
          valor={dinero(r.venta)}
          detalle={`sin IGV · con IGV ${dinero(r.total)}`}
          actual={r.venta}
          previo={comparar ? rp.venta : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.venta)}
        />
        <KpiCard
          etiqueta="Comprobantes"
          icono={<Receipt aria-hidden="true" />}
          valor={entero(r.documentos)}
          detalle={`${entero(r.facturas)} facturas · ${entero(r.boletas)} boletas`}
          actual={r.documentos}
          previo={comparar ? rp.documentos : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.documentos)}
        />
        <KpiCard
          etiqueta="Promedio por factura"
          icono={<Wallet aria-hidden="true" />}
          valor={dinero(ticket)}
          detalle="lo facturado entre el número de comprobantes"
          actual={ticket}
          previo={comparar ? ticketPrev : undefined}
          etiquetaComparacion={frase}
        />
        <KpiCard
          etiqueta="Clientes que compraron"
          icono={<Users aria-hidden="true" />}
          valor={entero(r.clientes)}
          detalle="con al menos un comprobante"
          actual={r.clientes}
          previo={comparar ? rp.clientes : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.clientes)}
          href={conParams(sp, "/dashboard/clientes", { cliente: null })}
        />
      </div>

      <Bloque
        titulo={comparar ? "Lo facturado, contra la comparación" : "Lo facturado"}
        descripcion={
          comparar
            ? `En azul este periodo; en gris ${f.comparar === "anio" ? "el mismo periodo del año pasado" : "el periodo anterior"}. Sin IGV.`
            : "Sin IGV, por periodo."
        }
      >
        {r.documentos === 0 && (!rp || rp.documentos === 0) ? (
          <p className="py-10 text-center text-base text-[var(--fg-muted)]">
            No hay comprobantes en este periodo. Prueba con «Últimos 12 meses» o «Todo».
          </p>
        ) : (
          <GraficoBarras
            datos={serie}
            series={[
              { clave: "actual", nombre: "Este periodo", color: "var(--viz-1)" },
              ...(comparar
                ? [
                    {
                      clave: "previo",
                      nombre: f.comparar === "anio" ? "Año pasado" : "Periodo anterior",
                      color: "var(--color-steel-300)",
                      esPrevio: true,
                    },
                  ]
                : []),
            ]}
          />
        )}

        {/* Las cifras exactas, para quien quiera leerlas y no estimarlas en la barra. */}
        <details className="group rounded-lg border border-[var(--border)]">
          <summary className="flex h-11 cursor-pointer list-none items-center px-4 text-base font-semibold hover:bg-[var(--surface-2)]">
            Ver las cifras periodo a periodo
          </summary>
          <div className="scroll-x border-t border-[var(--border)]">
            <table className="w-full min-w-[30rem] text-base">
              <thead className="bg-[var(--surface-2)] text-left text-sm text-[var(--fg-muted)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Periodo</th>
                  <th className="px-4 py-2 text-right font-semibold">Facturado</th>
                  {comparar ? (
                    <>
                      <th className="px-4 py-2 text-right font-semibold">Comparación</th>
                      <th className="px-4 py-2 text-right font-semibold">Cambio</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {serie.map((s) => {
                  const cambio =
                    s.previo !== null && s.previo > 0 ? ((s.actual - s.previo) / s.previo) * 100 : null;
                  return (
                    <tr key={s.etiqueta}>
                      <td className="px-4 py-2">{s.etiqueta}</td>
                      <td className="tabular px-4 py-2 text-right font-medium">{dinero(s.actual)}</td>
                      {comparar ? (
                        <>
                          <td className="tabular px-4 py-2 text-right text-[var(--fg-muted)]">
                            {s.previo === null ? "—" : dinero(s.previo)}
                            {s.etiquetaPrevia ? <span className="ml-1 text-sm">({s.etiquetaPrevia})</span> : null}
                          </td>
                          <td
                            className={`tabular px-4 py-2 text-right font-semibold ${
                              cambio === null ? "text-[var(--fg-muted)]" : cambio >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {cambio === null ? "—" : `${cambio > 0 ? "+" : ""}${pct(cambio)}`}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Bloque>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Notas de crédito"
          icono={<FileMinus aria-hidden="true" />}
          valor={dinero(r.notasMonto)}
          detalle={`${entero(r.notas)} ${r.notas === 1 ? "nota" : "notas"} · neto ${dinero(r.venta - r.notasMonto)}`}
          actual={r.notasMonto}
          previo={comparar ? rp.notasMonto : undefined}
          etiquetaComparacion={frase}
          mejorSi="baja"
        />
        <KpiCard
          etiqueta="Anuladas"
          icono={<Ban aria-hidden="true" />}
          valor={entero(r.anuladas)}
          detalle={`por ${dinero(r.anuladoMonto)}`}
          actual={r.anuladas}
          previo={comparar ? rp.anuladas : undefined}
          etiquetaComparacion={frase}
          mejorSi="baja"
        />
        <KpiCard
          etiqueta="Falta cobrar"
          icono={<Wallet aria-hidden="true" />}
          valor={dinero(r.saldo)}
          detalle={`de lo facturado en el periodo · cobrado ${dinero(r.cobrado)}`}
          href="/cobranzas"
        />
        <KpiCard
          etiqueta="Vencido"
          icono={<Wallet aria-hidden="true" />}
          valor={dinero(r.vencido)}
          detalle={r.vencido > 0 ? "ya pasó su plazo de pago" : "nada fuera de plazo"}
          href="/cobranzas"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-3">
        <Bloque titulo="Cómo terminaron" descripcion="Los comprobantes del periodo según su cobro.">
          <Partes
            partes={[...a.porEstado]
              .sort((x, y) => (ESTADO_COBRO[x.estado]?.orden ?? 9) - (ESTADO_COBRO[y.estado]?.orden ?? 9))
              .map((e) => ({
                clave: e.estado,
                texto: ESTADO_COBRO[e.estado]?.texto ?? e.estado,
                valor: e.documentos,
                color: ESTADO_COBRO[e.estado]?.color ?? "var(--color-steel-400)",
                cifra: `${entero(e.documentos)}`,
              }))}
            vacio="Sin comprobantes en este periodo."
          />
        </Bloque>

        <Bloque titulo="Contado y crédito" descripcion="Cuánto se facturó de cada forma, sin IGV.">
          <Partes
            partes={[
              { clave: "contado", texto: "Al contado", valor: r.contado, color: "var(--viz-3)", cifra: dinero(r.contado) },
              { clave: "credito", texto: "A crédito", valor: r.credito, color: "var(--viz-2)", cifra: dinero(r.credito) },
            ]}
            vacio="Sin comprobantes en este periodo."
          />
        </Bloque>

        <Bloque titulo="Con SUNAT" descripcion="Si llegaron y los aceptó, incluidas las bajas.">
          <Partes
            partes={[
              { clave: "ok", texto: "Aceptados", valor: r.sunatAceptado, color: "var(--viz-good)" },
              { clave: "pend", texto: "Sin respuesta todavía", valor: r.sunatPendiente, color: "var(--viz-warning)" },
              { clave: "mal", texto: "Observados o rechazados", valor: r.sunatProblema, color: "var(--viz-critical)" },
            ]}
            vacio="Sin comprobantes en este periodo."
          />
          {r.sunatPendiente + r.sunatProblema > 0 ? (
            <Link
              href="/facturacion"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--border-strong)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
            >
              Revisarlos en Facturación
            </Link>
          ) : null}
        </Bloque>
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque
          titulo="Los que más facturan"
          descripcion={cliente ? "Este cliente en el periodo." : "Toca uno para ver solo lo suyo."}
        >
          <Ranking
            filas={a.topClientes.map((c) => ({
              clave: c.id,
              nombre: c.cliente,
              detalle: `${entero(c.documentos)} ${c.documentos === 1 ? "comprobante" : "comprobantes"} · ${pct(r.venta > 0 ? (c.venta / r.venta) * 100 : 0)} del total`,
              valor: c.venta,
              cifra: dinero(c.venta),
              href: conParams(sp, "/dashboard/facturacion", { cliente: c.id }),
            }))}
          />
        </Bloque>

        <Bloque
          titulo="Lo que más se factura"
          descripcion={nombreCliente ? `Lo que se lleva ${nombreCliente}.` : "Por código, sin IGV."}
        >
          <Ranking
            color="var(--viz-3)"
            filas={a.topProductos.map((x) => ({
              clave: x.codigo,
              nombre: x.codigo,
              detalle: `${x.descripcion} · ${entero(x.unidades)} uds. en ${entero(x.documentos)} ${x.documentos === 1 ? "comprobante" : "comprobantes"}`,
              valor: x.venta,
              cifra: dinero(x.venta),
            }))}
          />
        </Bloque>
      </div>

      {historia.ok && historia.datos.serie.length > 0 ? (
        <Bloque
          titulo="Año por año"
          descripcion={`Todo lo facturado${nombreCliente ? ` a ${nombreCliente}` : ""}, sin IGV, sin importar el periodo de arriba. El año en curso va hasta hoy.`}
        >
          <AnioPorAnio serie={historia.datos.serie} hoy={hoy} />
        </Bloque>
      ) : null}

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Dato etiqueta="IGV facturado" valor={dinero(r.igv)} />
        <Dato etiqueta="Total con IGV" valor={dinero(r.total)} />
        <Dato etiqueta="Cobrado" valor={dinero(r.cobrado)} tono="ok" />
        <Dato etiqueta="Neto de notas" valor={dinero(r.venta - r.notasMonto)} />
      </div>
    </div>
  );
}

/**
 * Un año por fila, con su barra, su cifra y su cambio contra el año anterior.
 *
 * En HTML y no en recharts por lo mismo que los rankings: son pocos años, la
 * cifra se lee escrita y no hace falta pasar el ratón. El mejor año se marca,
 * que es literalmente lo que se preguntó.
 */
function AnioPorAnio({
  serie,
  hoy,
}: {
  serie: { periodo: string; venta: number; documentos: number }[];
  hoy: string;
}) {
  const anios = [...serie].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const max = Math.max(...anios.map((a) => a.venta));
  const anioHoy = hoy.slice(0, 4);
  return (
    // UNA rejilla para todas las filas (`contents` en cada <li>): con una por
    // fila, la columna de la cifra medía distinto en cada año y las barras
    // dejaban de ser comparables, que es lo único que tienen que ser.
    <ul className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1 @xl:grid-cols-[4.5rem_1fr_auto] @xl:gap-y-3">
      {anios.map((a, i) => {
        const anio = a.periodo.slice(0, 4);
        const anterior = anios[i - 1];
        // El primer año del histórico casi nunca es entero (el de Willy
        // empieza en septiembre de 2024): compararle el siguiente daba
        // «+255 %», que no dice nada del negocio. Se compara desde el segundo.
        const cambio =
          i >= 2 && anterior && anterior.venta > 0 ? ((a.venta - anterior.venta) / anterior.venta) * 100 : null;
        const mejor = a.venta === max;
        return (
          <li key={anio} className="contents">
            <span className="tabular text-lg font-semibold">{anio}</span>
            <span className="h-4 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, (a.venta / max) * 100)}%`, background: "var(--viz-1)" }}
              />
            </span>
            <span className="col-start-2 mb-2 flex flex-wrap items-baseline gap-x-3 @xl:col-start-3 @xl:mb-0 @xl:justify-end">
              <span className="tabular text-base font-semibold">{dinero(a.venta)}</span>
              <span className="text-sm text-[var(--fg-muted)]">
                {entero(a.documentos)} comprobantes
                {anio === anioHoy ? " · hasta hoy" : i === 0 && anios.length > 1 ? " · desde la primera factura" : ""}
              </span>
              {cambio !== null && anio !== anioHoy ? (
                <span className={`tabular text-sm font-semibold ${cambio >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                  {cambio > 0 ? "+" : ""}
                  {pct(cambio)} vs. {anterior?.periodo.slice(0, 4)}
                </span>
              ) : null}
              {mejor ? (
                <span className="rounded-full bg-[var(--ok-bg)] px-2 py-0.5 text-sm font-semibold text-[var(--ok)]">
                  El mejor año
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
