import Link from "next/link";
import { CalendarClock, CircleCheck, FileText, Hourglass, Target } from "lucide-react";
import { EstadoError, KpiCard, formatearFecha } from "@rodatech/ui";

import { FiltroRango, etiquetaPeriodo } from "@/modules/reportes";

import { clientesActivos, datosCotizaciones } from "../../api/ejecutivo";
import { FRASE_COMPARACION, tasaDeCierre } from "../../dominio/ejecutivo";
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
  uno,
  type ParamsBusqueda,
} from "./piezas";

/**
 * Tablero · Cotizaciones.
 *
 * Luis, 06/10, por Willy: *«cómo van las cotizaciones, cuántos están en
 * proceso, cuáles no»*.
 *
 * Tres preguntas, en este orden:
 *  1. **Qué hay en juego**: lo cotizado que todavía puede ganarse, y lo que se
 *     vence esta semana sin respuesta —esa lista es la que se trabaja—.
 *  2. **Cuánto se gana**: de lo que ya se decidió, qué parte se aprobó.
 *  3. **Qué y a quién** se cotiza más, y por qué se pierde.
 *
 * Una cotización «enviada» con la validez pasada cuenta como VENCIDA aunque
 * en la tabla siga enviada (104): contarla en juego inflaría justo la cifra
 * que se viene a vigilar.
 */

const ESTADOS: { clave: string; texto: string; color: string }[] = [
  { clave: "borrador", texto: "Sin enviar todavía", color: "var(--color-steel-400)" },
  { clave: "enviada", texto: "Enviadas, esperando respuesta", color: "var(--viz-1)" },
  { clave: "aprobada", texto: "Aprobadas", color: "var(--viz-good)" },
  { clave: "rechazada", texto: "Rechazadas", color: "var(--viz-critical)" },
  { clave: "vencida", texto: "Vencidas sin respuesta", color: "var(--viz-warning)" },
];

export default async function PaginaCotizacionesEjecutiva({
  searchParams,
}: {
  searchParams: Promise<ParamsBusqueda>;
}) {
  const sp = await searchParams;
  const hoy = hoyEnLima();
  const f = leerFiltros(sp, hoy);
  const frase = FRASE_COMPARACION[f.comparar];
  const cliente = uno(sp.cliente) ?? null;
  const lista = await clientesActivos();
  const clientes = lista.ok ? lista.datos : [];
  const nombreCliente = cliente ? (clientes.find((c) => c.id === cliente)?.nombre ?? null) : null;

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

  const [actual, previo] = await Promise.all([
    datosCotizaciones(f.rango, cliente),
    f.hayComparacion
      ? datosCotizaciones({ ...f.previo, grano: f.rango.grano }, cliente)
      : Promise.resolve(null),
  ]);

  if (!actual.ok) {
    return (
      <>
        {filtro}
        <EstadoError titulo="No se pudieron cargar las cotizaciones" detalle={actual.error} />
      </>
    );
  }

  const a = actual.datos;
  const r = a.resumen;
  const rp = previo?.ok ? previo.datos.resumen : undefined;
  const comparar = f.hayComparacion && rp !== undefined;
  const tasa = tasaDeCierre(r);
  const tasaPrev = rp ? tasaDeCierre(rp) : null;
  const enJuego = r.borrador + r.enviada;

  const porPeriodo = new Map(a.serie.map((p) => [p.periodo.slice(0, 10), p]));
  const serie = f.periodos.map((periodo) => {
    const p = porPeriodo.get(periodo);
    return {
      etiqueta: etiquetaPeriodo(periodo, f.rango.grano),
      cotizado: p?.monto ?? 0,
      aprobado: p?.montoAprobado ?? 0,
    };
  });

  const cuantas = (k: string) => a.porEstado.find((e) => e.estado === k)?.cotizaciones ?? 0;
  const montoDe = (k: string) => a.porEstado.find((e) => e.estado === k)?.monto ?? 0;

  return (
    <div className="@container flex flex-col gap-5">
      {filtro}

      <BotonExcel
        tipo="cotizaciones"
        sp={sp}
        explicacion={`Cada producto de cada cotización de este periodo${nombreCliente ? ` de ${nombreCliente}` : ""}, con su cliente, su marca y su familia. Trae también una hoja por producto y otra por cliente.`}
      />

      {/* Lo que hay hoy en la base: que no se lea como un fallo. */}
      {r.cotizaciones < 5 ? (
        <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-base">
          Todavía hay <strong>{entero(r.cotizaciones)}</strong>{" "}
          {r.cotizaciones === 1 ? "cotización" : "cotizaciones"} en este periodo. Las del sistema
          anterior no se cargaron; este tablero se va llenando con cada cotización que se hace en el ERP.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard
          etiqueta="Cotizaciones"
          icono={<FileText aria-hidden="true" />}
          valor={entero(r.cotizaciones)}
          detalle={`a ${entero(r.clientes)} ${r.clientes === 1 ? "cliente" : "clientes"}`}
          actual={r.cotizaciones}
          previo={comparar ? rp.cotizaciones : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.cotizaciones)}
          href="/cotizaciones"
        />
        <KpiCard
          etiqueta="Monto cotizado"
          icono={<Target aria-hidden="true" />}
          valor={dinero(r.monto)}
          detalle="sin IGV, sin contar las anuladas"
          actual={r.monto}
          previo={comparar ? rp.monto : undefined}
          etiquetaComparacion={frase}
          serie={a.serie.map((x) => x.monto)}
        />
        <KpiCard
          etiqueta="Se ganan"
          icono={<CircleCheck aria-hidden="true" />}
          valor={pct(tasa)}
          detalle={
            tasa === null
              ? "todavía no se ha decidido ninguna"
              : `${entero(r.aprobada)} de ${entero(r.aprobada + r.rechazada + r.vencida)} ya decididas`
          }
          actual={tasa ?? undefined}
          previo={comparar && tasaPrev !== null && tasa !== null ? tasaPrev : undefined}
          etiquetaComparacion={frase}
        />
        <KpiCard
          etiqueta="En juego"
          icono={<Hourglass aria-hidden="true" />}
          valor={dinero(r.montoProceso)}
          detalle={`${entero(enJuego)} ${enJuego === 1 ? "cotización" : "cotizaciones"} sin enviar o esperando respuesta`}
          href="/cotizaciones?estado=enviada"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-5">
        <Bloque
          className="@4xl:col-span-2"
          titulo="En qué están"
          descripcion="Las cotizaciones del periodo según su estado. Toca uno para abrir la lista."
        >
          <Partes
            partes={ESTADOS.map((e) => ({
              clave: e.clave,
              texto: e.texto,
              valor: cuantas(e.clave),
              color: e.color,
              href: `/cotizaciones?estado=${e.clave}`,
            }))}
            vacio="No hay cotizaciones en este periodo."
          />
          {r.anulada > 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              Aparte, {entero(r.anulada)} {r.anulada === 1 ? "anulada" : "anuladas"}, que no cuentan.
            </p>
          ) : null}
        </Bloque>

        <Bloque
          className="@4xl:col-span-3"
          titulo="Lo cotizado y lo aprobado"
          descripcion="Por periodo, sin IGV. La distancia entre las dos barras es lo que no se cerró."
        >
          {r.cotizaciones === 0 ? (
            <p className="py-10 text-center text-base text-[var(--fg-muted)]">No hay cotizaciones en este periodo.</p>
          ) : (
            <GraficoBarras
              datos={serie}
              series={[
                { clave: "cotizado", nombre: "Cotizado", color: "var(--viz-1)" },
                { clave: "aprobado", nombre: "Aprobado", color: "var(--viz-3)" },
              ]}
            />
          )}
        </Bloque>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Dato etiqueta="Aprobado" valor={dinero(r.montoAprobado)} tono="ok" />
        <Dato etiqueta="Perdido (rechazado o vencido)" valor={dinero(r.montoPerdido)} tono={r.montoPerdido > 0 ? "danger" : undefined} />
        <Dato etiqueta="Ya facturado de estas" valor={dinero(r.facturado)} />
        <Dato
          etiqueta="Días hasta aprobarse"
          valor={r.diasAprobacion === null ? "—" : `${r.diasAprobacion.toLocaleString("es-PE")} días`}
        />
      </div>

      <Bloque
        titulo="Se vencen pronto"
        descripcion="Sin enviar o esperando respuesta, por fecha de vencimiento. Son las llamadas de esta semana."
        accion={{ href: "/cotizaciones?estado=enviada", texto: "Ver todas" }}
      >
        {a.porVencer.length === 0 ? (
          <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ninguna cotización pendiente de respuesta.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {a.porVencer.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <CalendarClock
                  className={`size-5 shrink-0 ${c.dias <= 2 ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug">{c.cliente}</p>
                  <p className="text-sm text-[var(--fg-muted)]">
                    <span className="font-mono">{c.numero}</span> · {c.estado === "borrador" ? "sin enviar" : "enviada"} ·{" "}
                    {c.dias === 0 ? "vence hoy" : c.dias === 1 ? "vence mañana" : `vence en ${entero(c.dias)} días`} (
                    {formatearFecha(c.fechaVencimiento)})
                  </p>
                </div>
                <span className="tabular text-base font-semibold">{dinero(c.monto)}</span>
                <Link
                  href={`/cotizaciones/${c.id}`}
                  className="inline-flex h-10 items-center rounded-md border border-[var(--border-strong)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque titulo="A quién se cotiza más" descripcion="Por monto cotizado en el periodo.">
          <Ranking
            filas={a.topClientes.map((c) => ({
              clave: c.id,
              nombre: c.cliente,
              detalle: `${entero(c.cotizaciones)} ${c.cotizaciones === 1 ? "cotización" : "cotizaciones"} · ${entero(c.aprobadas)} ${c.aprobadas === 1 ? "aprobada" : "aprobadas"}`,
              valor: c.monto,
              cifra: dinero(c.monto),
              href: `/clientes/${c.id}`,
            }))}
            vacio="No hay cotizaciones en este periodo."
          />
        </Bloque>

        <Bloque titulo="Lo que más se cotiza" descripcion="Por cuántas cotizaciones lo llevan.">
          <Ranking
            color="var(--viz-3)"
            filas={a.topProductos.map((x) => ({
              clave: x.codigo,
              nombre: x.codigo,
              detalle: `${x.descripcion} · ${entero(x.cantidad)} uds. · ${dinero(x.monto)}`,
              valor: x.veces,
              cifra: `${entero(x.veces)} ${x.veces === 1 ? "vez" : "veces"}`,
            }))}
            vacio="No hay cotizaciones en este periodo."
          />
        </Bloque>
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Bloque titulo="Por vendedor" descripcion="Quién cotiza y cuánto se le aprueba.">
          {a.porVendedor.length === 0 ? (
            <p className="py-6 text-center text-base text-[var(--fg-muted)]">No hay cotizaciones en este periodo.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {a.porVendedor.map((v) => (
                <li key={v.vendedor} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="text-base font-semibold">{v.vendedor}</span>
                  <span className="text-sm text-[var(--fg-muted)]">
                    {entero(v.cotizaciones)} {v.cotizaciones === 1 ? "cotización" : "cotizaciones"} ·{" "}
                    {entero(v.aprobadas)} {v.aprobadas === 1 ? "aprobada" : "aprobadas"}
                  </span>
                  <span className="tabular w-full text-base font-semibold sm:w-auto">{dinero(v.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Por qué se pierden" descripcion="El motivo apuntado al rechazarlas.">
          <Ranking
            color="var(--viz-5)"
            filas={a.motivosRechazo.map((m) => ({
              clave: m.motivo,
              nombre: m.motivo,
              valor: m.veces,
              cifra: `${entero(m.veces)} ${m.veces === 1 ? "vez" : "veces"}`,
            }))}
            vacio="Ninguna rechazada en este periodo."
          />
        </Bloque>
      </div>

      {comparar && montoDe("aprobada") === 0 && rp.montoAprobado > 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          En la comparación se aprobaron {dinero(rp.montoAprobado)}.
        </p>
      ) : null}
    </div>
  );
}
