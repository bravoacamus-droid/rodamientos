import { Suspense } from "react";
import Link from "next/link";
import { AlarmClock, CalendarClock, FileText, HandCoins, Wallet } from "lucide-react";
import {
  Badge,
  EstadoError,
  EstadoVacio,
  Moneda,
  Skeleton,
  formatearFecha,
  formatearMoneda,
} from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FilaIndicadores, IndicadoresError, textoPeriodo } from "@/componentes/indicadores";
import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

import {
  cartera,
  carteraPorCliente,
  compromisosVencidos,
  gestiones,
  indicadoresCobranzas,
  ultimosPagos,
} from "../api/consultas";
import { etiquetaAtraso, tonoTramo } from "../dominio/cobro";
import {
  ETIQUETA_CANAL,
  ETIQUETA_MEDIO,
  type DocumentoPorCobrar,
  type FiltrosCartera,
} from "../dominio/tipos";
import { Cobrador } from "./cobrador";
import { FiltrosCarteraBarra } from "./filtros";
import { Gestor } from "./gestor";
import { VoucherDelPago } from "./voucher-del-pago";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Cobranzas.
 *
 * La pantalla está ordenada como se trabaja: primero los compromisos que
 * vencen hoy —alguien prometió pagar y llegó la fecha—, después la cartera de
 * lo más atrasado a lo menos, y al final el histórico.
 *
 * No hay paginación en la cartera a propósito: son decenas de documentos, no
 * miles, y quien cobra quiere verlos todos para decidir a quién llama.
 */
export default async function PaginaCobranzas({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosCartera = {
    q: uno(sp.q),
    cliente: uno(sp.cliente),
    tramo: uno(sp.tramo),
    vencido: uno(sp.vencido),
  };
  // El periodo solo cuenta lo COBRADO (07/10): lo que se debe es de hoy.
  const periodo = { desde: uno(sp.desde), hasta: uno(sp.hasta) };

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  // El nombre del cliente filtrado, para que el filtro lo enseñe en vez de
  // un id. Una fila, como en facturación.
  const [perfil, cliente] = await Promise.all([
    perfilActual(),
    filtros.cliente ? nombreDelCliente(filtros.cliente) : Promise.resolve(null),
  ]);
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeCobrar =
    rol !== null && ["gerencia", "admin", "ventas", "cobranzas"].includes(rol);
  const puedeGestionar = rol !== null && ["gerencia", "admin", "cobranzas"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cobranzas</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que está por cobrar, de lo más atrasado a lo menos. Registrar un pago
            actualiza el saldo y las cuotas solo.
          </p>
        </div>
        {/*
          El estado de cuenta para mandar al cliente (Willy, 06/10: «hay que
          enviar el reporte de su estado de cuenta para que hagan el pago»).
          Con un cliente filtrado, va directo al suyo.
        */}
        <Link
          href={
            filtros.cliente
              ? `/cobranzas/estado-de-cuenta?cliente=${filtros.cliente}`
              : "/cobranzas/estado-de-cuenta"
          }
          className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base font-semibold shadow-sm hover:bg-[var(--surface-2)]"
        >
          <FileText className="size-5 shrink-0" aria-hidden="true" />
          {filtros.cliente && cliente?.ok
            ? `Estado de cuenta de ${cliente.nombre}`
            : "Estado de cuenta de un cliente"}
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Compromisos hoy={hoy} />
      </Suspense>

      <Suspense
        key={`${periodo.desde}|${periodo.hasta}`}
        fallback={<Skeleton className="h-32 w-full" />}
      >
        <Indicadores periodo={periodo} />
      </Suspense>

      {/* `@container`: tarjetas o tabla según el ancho de esta caja, no de la
          pantalla (revisión por módulos del 02/10). */}
      <section className="card @container pt-4">
        <FiltrosCarteraBarra nombreCliente={cliente?.ok ? cliente.nombre : null} />
        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaCartera
            filtros={filtros}
            hoy={hoy}
            puedeCobrar={puedeCobrar}
            puedeGestionar={puedeGestionar}
          />
        </Suspense>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-semibold">Lo cobrado</h2>
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <BarraPeriodo
              titulo="Periodo"
              ayuda="Cuenta lo cobrado; lo que se debe es siempre el de hoy."
            />
          </Suspense>
          <Suspense
            key={`${periodo.desde}|${periodo.hasta}`}
            fallback={<Skeleton className="h-40 w-full" />}
          >
            <ListaPagos periodo={periodo} puedeSubir={puedeGestionar} />
          </Suspense>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Últimas gestiones</h2>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <ListaGestiones />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function Compromisos({ hoy }: { hoy: string }) {
  const r = await compromisosVencidos(hoy);
  if (!r.ok || r.datos.length === 0) return null;

  return (
    <section className="anim-entrada rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
      <h2 className="text-sm font-semibold">
        {r.datos.length === 1
          ? "Hay un compromiso de pago que ya llegó"
          : `Hay ${r.datos.length} compromisos de pago que ya llegaron`}
      </h2>
      <ul className="mt-1.5 flex flex-col gap-1 text-sm">
        {r.datos.map((g) => (
          <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular text-sm text-[var(--fg-muted)]">
              {formatearFecha(g.compromiso_fecha)}
            </span>
            <span>{g.nota}</span>
            {g.comprobante_numero ? (
              <span className="font-mono text-sm">{g.comprobante_numero}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Las cuatro cifras de cobranzas (07/10, sobre las tres que había): lo que se
 * debe, lo vencido —con a quién llamar primero—, lo que vence esta semana y
 * lo cobrado en el periodo, que es el arqueo semanal de Willy.
 */
async function Indicadores({ periodo }: { periodo: { desde?: string; hasta?: string } }) {
  const [r, porCliente] = await Promise.all([indicadoresCobranzas(periodo), carteraPorCliente()]);
  if (!r.ok) return <IndicadoresError detalle={r.error} />;
  const d = r.datos;
  const peor = porCliente.ok ? porCliente.datos[0] : undefined;
  return (
    <FilaIndicadores
      items={[
        {
          etiqueta: "Por cobrar",
          valor: formatearMoneda(d.porCobrar),
          detalle: `${d.documentos} ${d.documentos === 1 ? "factura" : "facturas"} de ${d.clientes} ${d.clientes === 1 ? "cliente" : "clientes"}`,
          icono: <Wallet aria-hidden="true" />,
        },
        {
          etiqueta: "Ya vencido",
          valor: formatearMoneda(d.vencido),
          detalle:
            d.vencido > 0
              ? `${d.docsVencidos} ${d.docsVencidos === 1 ? "factura" : "facturas"}${peor ? ` · llamar primero a ${peor.cliente}` : ""}`
              : "nada fuera de plazo",
          tono: d.vencido > 0 ? "urgente" : "ok",
          icono: <AlarmClock aria-hidden="true" />,
          href: d.vencido > 0 ? "/cobranzas?vencido=1" : undefined,
        },
        {
          etiqueta: "Vence esta semana",
          valor: formatearMoneda(d.venceSemana),
          detalle: d.docsSemana > 0 ? `${d.docsSemana} ${d.docsSemana === 1 ? "factura" : "facturas"} en los próximos 7 días` : "nada en los próximos 7 días",
          tono: d.docsSemana > 0 ? "aviso" : undefined,
          icono: <CalendarClock aria-hidden="true" />,
        },
        {
          etiqueta: "Cobrado",
          valor: formatearMoneda(d.cobrado),
          detalle: `${d.pagos} ${d.pagos === 1 ? "pago" : "pagos"} · ${textoPeriodo(periodo.desde, periodo.hasta)}`,
          tono: d.cobrado > 0 ? "ok" : undefined,
          icono: <HandCoins aria-hidden="true" />,
        },
      ]}
    />
  );
}

async function TablaCartera({
  filtros,
  hoy,
  puedeCobrar,
  puedeGestionar,
}: {
  filtros: FiltrosCartera;
  hoy: string;
  puedeCobrar: boolean;
  puedeGestionar: boolean;
}) {
  const r = await cartera(filtros);
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudo cargar la cartera"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  if (r.datos.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.cliente || filtros.tramo || filtros.vencido,
    );
    const soloCliente =
      Boolean(filtros.cliente) && !filtros.q && !filtros.tramo && !filtros.vencido;
    return (
      <EstadoVacio
        // Desde la ficha del cliente se llega con `?cliente=` y nada más: ahí
        // «Nada coincide con el filtro» no contesta lo que se vino a
        // preguntar (revisión por módulos del 02/10).
        titulo={
          soloCliente
            ? "Este cliente no debe nada"
            : filtrando
              ? "Nada coincide con el filtro"
              : "No hay nada por cobrar"
        }
        descripcion={
          filtrando
            ? soloCliente
              ? "Todo lo que se le facturó está cobrado."
              : "Prueba con menos filtros."
            : "Todo lo facturado está cobrado. Cuando se emita una factura al crédito, aparecerá aquí."
        }
      />
    );
  }

  return (
    <CarteraVista
      datos={r.datos}
      hoy={hoy}
      puedeCobrar={puedeCobrar}
      puedeGestionar={puedeGestionar}
    />
  );
}

/**
 * La cartera ya leída: tarjetas o tabla.
 *
 * Aparte de la lectura, para poder pintarla con datos de muestra: hoy la
 * cartera real está vacía —las 482 facturas cargadas están cobradas— y así
 * se revisaron las tarjetas, la tabla y los dos diálogos el 02/10 (revisión
 * por módulos), con una página provisional que ya no existe.
 */
export function CarteraVista({
  datos,
  hoy,
  puedeCobrar,
  puedeGestionar,
}: {
  datos: DocumentoPorCobrar[];
  hoy: string;
  puedeCobrar: boolean;
  puedeGestionar: boolean;
}) {
  return (
    <>
      {/*
        EN MÓVIL, TARJETAS.

        Medido el 24/09: esta tabla pide 790 px y un teléfono tiene 390. Con
        `scroll-x` no se rompe, pero hay que arrastrar de lado para llegar al
        saldo y al botón de cobrar — y esta es justo la pantalla que se mira
        fuera del escritorio, cuando se está llamando a un cliente para
        cobrarle. El número de la factura y el saldo tienen que verse juntos
        y sin moverse.
      */}
      <div className="grid gap-3 p-3 pt-0 @3xl:hidden @xl:grid-cols-2">
        {datos.map((d) => (
          <div key={d.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/facturacion/${d.id}`}
                className="font-mono text-sm font-medium text-brand-600 hover:underline"
              >
                {d.numero}
              </Link>
              {/* Con su «$»: era «1250.00» a secas, la única cifra del
                  ERP sin moneda (revisión por módulos del 02/10). */}
              <Moneda valor={d.saldo} className="text-lg font-semibold" />
            </div>

            <p className="mt-1 text-sm">{d.cliente}</p>
            {d.orden_compra_cliente ? (
              <p className="text-sm text-[var(--fg-subtle)]">
                OC {d.orden_compra_cliente}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="tabular text-sm text-[var(--fg-muted)]">
                Vence {formatearFecha(d.fecha_vencimiento)}
              </span>
              <Badge tone={tonoTramo(d.tramo_aging)} size="xs">
                {etiquetaAtraso(d.dias_vencido, d.fecha_vencimiento)}
              </Badge>
            </div>

            {d.pagado > 0 ? (
              <p className="mt-1 text-sm text-[var(--fg-subtle)]">
                De <Moneda valor={d.total} tamano="sm" className="text-inherit" />, ya
                pagó <Moneda valor={d.pagado} tamano="sm" className="text-inherit" />
              </p>
            ) : null}

            {puedeGestionar || puedeCobrar ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {puedeGestionar ? <Gestor documento={d} hoy={hoy} /> : null}
                {puedeCobrar ? <Cobrador documento={d} hoy={hoy} /> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/*
        Revisión por módulos del 02/10, con datos de muestra a 1280 px: la
        tabla pedía más que la caja y «Anotar» y «Cobrar» quedaban FUERA, el
        número se partía en «F002-» y «00000516» y el cliente se cortaba en
        «MECA…». Ahora el total va debajo del saldo («de $ …»), el cliente
        parte línea en vez de cortarse, y los dos botones van uno sobre otro
        en una columna fija a la derecha.
      */}
      <div className="scroll-x hidden @3xl:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-sm uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-3 py-2.5 font-medium">Documento</th>
            <th className="px-3 py-2.5 font-medium">Cliente</th>
            <th className="px-3 py-2.5 font-medium">Vencimiento</th>
            <th className="px-3 py-2.5 text-right font-medium">Saldo</th>
            <th className="sticky right-0 z-20 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 text-right font-medium">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d, i) => (
            <tr
              key={d.id}
              className="anim-entrada group/fila border-b border-[var(--border-soft)] align-top transition-colors hover:bg-[var(--surface-2)]"
              style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/facturacion/${d.id}`}
                  className="whitespace-nowrap font-mono text-sm font-medium text-brand-600 hover:underline"
                >
                  {d.numero}
                </Link>
                {d.orden_compra_cliente ? (
                  <span className="block max-w-48 break-words text-sm text-[var(--fg-subtle)]">
                    OC {d.orden_compra_cliente}
                  </span>
                ) : null}
              </td>

              <td className="px-3 py-2.5">
                <span className="block">{d.cliente}</span>
                <span className="block font-mono text-sm text-[var(--fg-subtle)]">
                  {d.documento ?? ""}
                </span>
              </td>

              <td className="whitespace-nowrap px-3 py-2.5">
                <span className="tabular block">{formatearFecha(d.fecha_vencimiento)}</span>
                <Badge tone={tonoTramo(d.tramo_aging)} size="xs">
                  {etiquetaAtraso(d.dias_vencido, d.fecha_vencimiento)}
                </Badge>
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <Moneda valor={d.saldo} className="text-base font-semibold" />
                <span className="block text-sm text-[var(--fg-subtle)]">
                  de <Moneda valor={d.total} tamano="sm" className="text-inherit" />
                </span>
                {d.pagado > 0 ? (
                  <span className="block text-sm text-[var(--fg-subtle)]">
                    ya pagó <Moneda valor={d.pagado} tamano="sm" className="text-inherit" />
                  </span>
                ) : null}
              </td>

              <td className="sticky right-0 z-10 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 group-hover/fila:bg-[var(--surface-2)]">
                <div className="flex flex-col items-stretch gap-1.5 [&>*]:justify-center">
                  {puedeGestionar ? <Gestor documento={d} hoy={hoy} /> : null}
                  {puedeCobrar ? <Cobrador documento={d} hoy={hoy} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

async function ListaPagos({
  periodo,
  puedeSubir,
}: {
  periodo: { desde?: string; hasta?: string };
  puedeSubir: boolean;
}) {
  const r = await ultimosPagos(15, periodo);
  if (!r.ok) return <EstadoError titulo="No se pudieron cargar los pagos" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--fg-muted)]">
        {periodo.desde || periodo.hasta
          ? "Ningún pago registrado en este periodo."
          : "Todavía no se ha registrado ningún pago."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
      {r.datos.map((p, i) => (
        <li
          key={p.id}
          className="anim-entrada flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 text-sm"
          style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
        >
          <div className="min-w-0">
            <Link
              href={`/facturacion/${p.comprobante_id}`}
              className="font-mono text-sm font-medium text-brand-600 hover:underline"
            >
              {p.comprobante_numero}
            </Link>
            <span className="ml-2 text-sm text-[var(--fg-muted)]">
              {ETIQUETA_MEDIO[p.medio] ?? p.medio}
              {p.referencia ? ` · ${p.referencia}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 text-right">
            <span>
              <Moneda valor={p.monto} tamano="sm" enfasis="fuerte" />
              <span className="ml-2 tabular text-sm text-[var(--fg-subtle)]">
                {formatearFecha(p.fecha)}
              </span>
            </span>
            <VoucherDelPago pagoId={p.id} tiene={p.tiene_voucher} puedeSubir={puedeSubir} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function ListaGestiones() {
  const r = await gestiones(undefined, 15);
  if (!r.ok) {
    return <EstadoError titulo="No se pudieron cargar las gestiones" detalle={r.error} />;
  }

  if (r.datos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--fg-muted)]">
        Sin gestiones apuntadas. Cuando llames a un cliente, anótalo: la promesa que
        no se apunta se olvida.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
      {r.datos.map((g, i) => (
        <li
          key={g.id}
          className="anim-entrada py-2 text-sm"
          style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm font-medium">
              {ETIQUETA_CANAL[g.canal] ?? g.canal}
              {g.comprobante_numero ? (
                <span className="ml-2 font-mono text-[var(--fg-muted)]">
                  {g.comprobante_numero}
                </span>
              ) : null}
            </span>
            <span className="tabular text-sm text-[var(--fg-subtle)]">
              {formatearFecha(g.fecha.slice(0, 10))}
            </span>
          </div>
          {g.resultado ? <p className="mt-0.5">{g.resultado}</p> : null}
          {g.nota ? (
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{g.nota}</p>
          ) : null}
          {g.compromiso_fecha ? (
            <p className="mt-0.5 text-sm font-medium text-[var(--warn)]">
              Prometió pagar el {formatearFecha(g.compromiso_fecha)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
