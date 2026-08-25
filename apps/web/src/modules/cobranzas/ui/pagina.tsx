import { Suspense } from "react";
import Link from "next/link";
import {
  Badge,
  CifraAnimada,
  EstadoError,
  EstadoVacio,
  Skeleton,
} from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import {
  cartera,
  carteraPorCliente,
  compromisosVencidos,
  gestiones,
  ultimosPagos,
} from "../api/consultas";
import { etiquetaAtraso, tonoTramo } from "../dominio/cobro";
import { ETIQUETA_CANAL, ETIQUETA_MEDIO, type FiltrosCartera } from "../dominio/tipos";
import { Cobrador } from "./cobrador";
import { FiltrosCarteraBarra } from "./filtros";
import { Gestor } from "./gestor";

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

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  const perfil = await perfilActual();
  const rol = perfil?.activo ? perfil.rol : null;
  const puedeCobrar =
    rol !== null && ["gerencia", "admin", "ventas", "cobranzas"].includes(rol);
  const puedeGestionar = rol !== null && ["gerencia", "admin", "cobranzas"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cobranzas</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Lo que está por cobrar, de lo más atrasado a lo menos. Registrar un pago
          actualiza el saldo y las cuotas solo.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Compromisos hoy={hoy} />
      </Suspense>

      <Suspense fallback={<div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}>
        <Indicadores />
      </Suspense>

      <section className="card pt-4">
        <FiltrosCarteraBarra />
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
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Últimos pagos</h2>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <ListaPagos />
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
            <span className="tabular text-xs text-[var(--fg-muted)]">
              {g.compromiso_fecha}
            </span>
            <span>{g.nota}</span>
            {g.comprobante_numero ? (
              <span className="font-mono text-xs">{g.comprobante_numero}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Indicadores() {
  const r = await carteraPorCliente();
  if (!r.ok) return <EstadoError titulo="No se pudo cargar la cartera" detalle={r.error} />;

  const total = r.datos.reduce((a, c) => a + c.saldo, 0);
  const vencido = r.datos.reduce((a, c) => a + c.vencido, 0);
  const peor = r.datos[0];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">Por cobrar</p>
        <p className="mt-0.5 text-xl font-semibold">
          <CifraAnimada valor={total} decimales={2} prefijo="$ " />
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {r.datos.length} {r.datos.length === 1 ? "cliente" : "clientes"}
        </p>
      </div>

      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">Ya vencido</p>
        <p
          className={`mt-0.5 text-xl font-semibold ${vencido > 0 ? "text-[var(--danger)]" : ""}`}
        >
          <CifraAnimada valor={vencido} decimales={2} prefijo="$ " />
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {total > 0 ? `${Math.round((vencido / total) * 100)} % de la cartera` : "nada"}
        </p>
      </div>

      <div className="card anim-entrada p-3">
        <p className="text-xs text-[var(--fg-muted)]">A quién llamar primero</p>
        <p className="mt-0.5 truncate text-base font-semibold">
          {peor ? peor.cliente : "—"}
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
          {peor
            ? `$ ${peor.saldo.toFixed(2)}${peor.diasMasAntiguo > 0 ? ` · ${peor.diasMasAntiguo} días` : ""}`
            : "no hay nada que cobrar"}
        </p>
      </div>
    </div>
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
    return (
      <EstadoVacio
        titulo={filtrando ? "Nada coincide con el filtro" : "No hay nada por cobrar"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros."
            : "Todo lo facturado está cobrado. Cuando se emita una factura al crédito, aparecerá aquí."
        }
      />
    );
  }

  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
            <th className="px-4 py-2.5 font-medium">Documento</th>
            <th className="px-4 py-2.5 font-medium">Cliente</th>
            <th className="px-4 py-2.5 font-medium">Vencimiento</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {r.datos.map((d, i) => (
            <tr
              key={d.id}
              className="anim-entrada border-b border-[var(--border-soft)] transition-colors hover:bg-[var(--surface-2)]"
              style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
            >
              <td className="px-4 py-2.5">
                <Link
                  href={`/facturacion/${d.id}`}
                  className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
                >
                  {d.numero}
                </Link>
                {d.orden_compra_cliente ? (
                  <span className="block text-[0.7rem] text-[var(--fg-subtle)]">
                    OC {d.orden_compra_cliente}
                  </span>
                ) : null}
              </td>

              <td className="max-w-xs px-4 py-2.5">
                <span className="block truncate">{d.cliente}</span>
                <span className="block font-mono text-[0.7rem] text-[var(--fg-subtle)]">
                  {d.documento ?? ""}
                </span>
              </td>

              <td className="whitespace-nowrap px-4 py-2.5">
                <span className="tabular block">{d.fecha_vencimiento ?? "—"}</span>
                <Badge tone={tonoTramo(d.tramo_aging)} size="xs">
                  {etiquetaAtraso(d.dias_vencido, d.fecha_vencimiento)}
                </Badge>
              </td>

              <td className="px-4 py-2.5 text-right tabular text-[var(--fg-muted)]">
                {d.total.toFixed(2)}
              </td>

              <td className="px-4 py-2.5 text-right tabular font-medium">
                {d.saldo.toFixed(2)}
                {d.pagado > 0 ? (
                  <span className="block text-[0.7rem] font-normal text-[var(--fg-subtle)]">
                    pagado {d.pagado.toFixed(2)}
                  </span>
                ) : null}
              </td>

              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <div className="flex justify-end gap-1.5">
                  {puedeGestionar ? <Gestor documento={d} hoy={hoy} /> : null}
                  {puedeCobrar ? <Cobrador documento={d} hoy={hoy} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ListaPagos() {
  const r = await ultimosPagos(15);
  if (!r.ok) return <EstadoError titulo="No se pudieron cargar los pagos" detalle={r.error} />;

  if (r.datos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--fg-muted)]">
        Todavía no se ha registrado ningún pago.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
      {r.datos.map((p, i) => (
        <li
          key={p.id}
          className="anim-entrada flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
          style={{ animationDelay: `${Math.min(i, 6) * 24}ms` }}
        >
          <div className="min-w-0">
            <Link
              href={`/facturacion/${p.comprobante_id}`}
              className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
            >
              {p.comprobante_numero}
            </Link>
            <span className="ml-2 text-xs text-[var(--fg-muted)]">
              {ETIQUETA_MEDIO[p.medio] ?? p.medio}
              {p.referencia ? ` · ${p.referencia}` : ""}
            </span>
          </div>
          <div className="text-right">
            <span className="tabular font-medium">$ {p.monto.toFixed(2)}</span>
            <span className="ml-2 tabular text-xs text-[var(--fg-subtle)]">{p.fecha}</span>
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
            <span className="text-xs font-medium">
              {ETIQUETA_CANAL[g.canal] ?? g.canal}
              {g.comprobante_numero ? (
                <span className="ml-2 font-mono text-[var(--fg-muted)]">
                  {g.comprobante_numero}
                </span>
              ) : null}
            </span>
            <span className="tabular text-xs text-[var(--fg-subtle)]">
              {g.fecha.slice(0, 10)}
            </span>
          </div>
          {g.resultado ? <p className="mt-0.5">{g.resultado}</p> : null}
          {g.nota ? (
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{g.nota}</p>
          ) : null}
          {g.compromiso_fecha ? (
            <p className="mt-0.5 text-xs font-medium text-[var(--warn)]">
              Prometió pagar el {g.compromiso_fecha}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
