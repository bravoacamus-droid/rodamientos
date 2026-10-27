import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, TriangleAlert, Warehouse } from "lucide-react";
import { EstadoVacio, Moneda, PaginacionKeyset, formatearFecha } from "@rodatech/ui";

import {
  cobroDe,
  margenPct,
  sunatDe,
  totalVisible,
  type FilaPedido,
  type Orden,
} from "../dominio/lista";
import { AccionesPedido, type PedidoParaAcciones } from "./acciones";
import { InsigniaEtapa } from "./insignia";

const paraAcciones = (p: FilaPedido): PedidoParaAcciones => ({
  id: p.id,
  numero: p.numero,
  cotizacionId: p.cotizacionId,
  cotizacion: p.cotizacion,
  vigente: p.vigente,
  guia: p.guia ? { id: p.guia.id, emitida: p.guia.emitida } : null,
  facturado: p.facturas.length > 0,
  conCompras: p.compras.total > 0,
});

type Params = Record<string, string | undefined>;

/** El enlace de una cabecera ordenable: la misma URL con otro `orden`. */
function hrefOrden(params: Params, campo: Orden, actual: { campo: Orden; desc: boolean }) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "orden" && k !== "cursor" && k !== "dir") p.set(k, v);
  // Al pulsar la misma columna se invierte; una nueva empieza por lo mayor.
  const desc = actual.campo === campo ? !actual.desc : campo !== "cliente";
  p.set("orden", desc ? `-${campo}` : campo);
  return `/pedidos?${p.toString()}`;
}

function Cabecera({
  campo,
  children,
  params,
  orden,
  derecha = false,
}: {
  campo: Orden;
  children: React.ReactNode;
  params: Params;
  orden: { campo: Orden; desc: boolean };
  derecha?: boolean;
}) {
  const activa = orden.campo === campo;
  const Icono = !activa ? ArrowUpDown : orden.desc ? ArrowDown : ArrowUp;
  return (
    <th className={`px-3 py-2.5 font-medium ${derecha ? "text-right" : "text-left"}`} aria-sort={activa ? (orden.desc ? "descending" : "ascending") : undefined}>
      <Link
        href={hrefOrden(params, campo, orden)}
        className={`inline-flex items-center gap-1 rounded-sm uppercase hover:text-[var(--fg)] ${activa ? "text-[var(--fg)]" : ""}`}
      >
        {children}
        <Icono className="size-3.5" aria-hidden="true" />
      </Link>
    </th>
  );
}

const SUNAT: Record<ReturnType<typeof sunatDe>, { texto: string; clase: string }> = {
  aceptado: { texto: "Aceptada", clase: "text-[var(--ok)]" },
  pendiente: { texto: "Sin enviar", clase: "text-[var(--warn)]" },
  rechazado: { texto: "Rechazada", clase: "font-semibold text-[var(--danger)]" },
  sin_factura: { texto: "—", clase: "text-[var(--fg-subtle)]" },
};

/** El margen, con color solo cuando dice algo: bajo o negativo. */
function Margen({ p }: { p: FilaPedido }) {
  const m = margenPct(p.venta, p.costo);
  if (m === null) return <span className="text-[var(--fg-subtle)]">sin costo</span>;
  return <span className={`tabular font-medium ${m < 0 ? "text-[var(--danger)]" : m < 10 ? "text-[var(--warn)]" : ""}`}>{m.toFixed(1)} %</span>;
}

function Compras({ p }: { p: FilaPedido }) {
  // «Sin órdenes» no decía si faltaba o había stock (Willy, 16/10). Ahora lo
  // dice: falta hacer la orden, o sale del almacén.
  if (p.compras.total === 0) {
    if ((p.compras.faltaPedir ?? 0) > 0) {
      return (
        <span className="inline-flex items-center gap-1 font-medium text-[var(--warn)]">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Falta hacer la orden
        </span>
      );
    }
    return p.vigente ? (
      <span className="inline-flex items-center gap-1">
        <Warehouse className="size-4 text-[var(--fg-muted)]" aria-hidden="true" />
        Sale del almacén
      </span>
    ) : (
      <span className="text-[var(--fg-subtle)]">sin órdenes</span>
    );
  }
  return p.compras.porRegistrar > 0 ? (
    <span className="font-medium">
      {p.compras.total - p.compras.porRegistrar} de {p.compras.total} compradas
    </span>
  ) : (
    <span className="inline-flex items-center gap-1">
      <CircleCheck className="size-4 text-[var(--ok)]" aria-hidden="true" />
      {p.compras.total === 1 ? "comprada" : `${p.compras.total} compradas`}
    </span>
  );
}

function Guia({ p }: { p: FilaPedido }) {
  if (!p.guia) return <span className="text-[var(--fg-subtle)]">—</span>;
  return (
    <Link href={`/guias/${p.guia.id}`} className="font-mono text-sm text-brand-600 hover:underline">
      {p.guia.numero}
      {p.guia.emitida ? null : <span className="block font-sans text-[var(--fg-muted)]">borrador</span>}
    </Link>
  );
}

function Cobro({ p }: { p: FilaPedido }) {
  const c = cobroDe(p);
  if (c === "sin_factura") return <span className="text-[var(--fg-subtle)]">—</span>;
  const f = p.facturas[0]!;
  const saldo = p.facturas.reduce((a, x) => a + x.saldo, 0);
  return (
    <span className="block">
      <Link href={`/facturacion/${f.id}`} className="font-mono text-sm text-brand-600 hover:underline">
        {f.numero}
        {p.facturas.length > 1 ? ` +${p.facturas.length - 1}` : ""}
      </Link>
      <span className={`block ${c === "vencido" ? "font-semibold text-[var(--danger)]" : c === "pagado" ? "text-[var(--ok)]" : ""}`}>
        {c === "pagado" ? (
          "Cobrada"
        ) : (
          <>
            {c === "vencido" ? "Vencida · " : "Debe "}
            <Moneda valor={saldo} moneda={f.moneda} tamano="sm" className="text-inherit" />
          </>
        )}
      </span>
    </span>
  );
}

export function TablaPedidos({
  filas,
  total,
  params,
  orden,
  pagina,
  porPagina,
  filtrando,
}: {
  filas: FilaPedido[];
  total: number;
  params: Params;
  orden: { campo: Orden; desc: boolean };
  pagina: { anterior: string | null; siguiente: string | null };
  porPagina: number;
  filtrando: boolean;
}) {
  if (filas.length === 0) {
    return (
      <EstadoVacio
        titulo={filtrando ? "Ningún pedido coincide" : "Todavía no hay pedidos en este periodo"}
        descripcion={
          filtrando
            ? "Prueba con menos filtros, o busca por pedido, cotización, cliente o código."
            : "Un pedido nace al aprobar una cotización, o con «Atender otro pedido» desde una ya atendida."
        }
      />
    );
  }

  return (
    <div className="@container">
      {/* ------------------------------------------------ Escritorio */}
      <div className="scroll-x hidden @4xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-sm tracking-wide text-[var(--fg-subtle)]">
              <th className="px-3 py-2.5 text-left font-medium uppercase">Pedido</th>
              <Cabecera campo="fecha" params={params} orden={orden}>Fecha</Cabecera>
              <Cabecera campo="cliente" params={params} orden={orden}>Cliente</Cabecera>
              <Cabecera campo="total" params={params} orden={orden} derecha>Total</Cabecera>
              <Cabecera campo="margen" params={params} orden={orden} derecha>Margen</Cabecera>
              <th className="px-3 py-2.5 text-left font-medium uppercase">Compras</th>
              <th className="px-3 py-2.5 text-left font-medium uppercase">Guía</th>
              <th className="px-3 py-2.5 text-left font-medium uppercase">Factura · cobro</th>
              <th className="px-3 py-2.5 text-left font-medium uppercase">SUNAT</th>
              <Cabecera campo="etapa" params={params} orden={orden}>Etapa</Cabecera>
              <th className="sticky right-0 z-20 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 text-right font-medium uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p, i) => (
              <tr
                key={p.id}
                className="group/fila anim-entrada border-b border-[var(--border-soft)] align-top transition-colors hover:bg-[var(--surface-2)]"
                style={{ animationDelay: `${Math.min(i, 6) * 28}ms` }}
              >
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Link href={`/pedidos/${p.id}`} className="font-mono text-sm font-semibold text-brand-600 hover:underline">
                    {p.numero}
                  </Link>
                  <Link href={`/cotizaciones/${p.cotizacionId}`} className="block font-mono text-sm text-[var(--fg-subtle)] hover:underline">
                    {p.secuencia > 1 ? `${p.secuencia}.º de ` : ""}
                    {p.cotizacion}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular">{formatearFecha(p.fecha)}</td>
                <td className="max-w-[16rem] px-3 py-2.5">
                  <span className="block truncate font-medium" title={p.cliente}>
                    {p.cliente}
                  </span>
                  <span className="block truncate text-[var(--fg-muted)]">
                    {p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Moneda valor={totalVisible(p)} moneda={p.moneda} tamano="sm" />
                  <span className="block text-[var(--fg-subtle)]">con IGV</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Margen p={p} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Compras p={p} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Guia p={p} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cobro p={p} />
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 ${SUNAT[sunatDe(p)].clase}`}>{SUNAT[sunatDe(p)].texto}</td>
                <td className="px-3 py-2.5">
                  <InsigniaEtapa etapa={p.etapa} despacho={p.despacho} />
                </td>
                <td className="sticky right-0 z-10 border-l border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5 text-right group-hover/fila:bg-[var(--surface-2)]">
                  <AccionesPedido p={paraAcciones(p)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------ Tarjetas
          Sueltas, cada una con su borde, como cotizaciones, facturación y
          guías: separadas por una raya era lo que Luis rechazó el 11/09
          («todo junto, apegado»). Pasan a tabla en @4xl y no en @3xl, como
          las demás, porque esta tabla lleva diez columnas y a @3xl no caben. */}
      <ul className="flex flex-col gap-2.5 p-3 @4xl:hidden">
        {filas.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/pedidos/${p.id}`} className="font-mono text-base font-semibold text-brand-600 hover:underline">
                  {p.numero}
                </Link>
                <p className="truncate font-medium">{p.cliente}</p>
                <p className="text-sm text-[var(--fg-muted)]">
                  {p.cotizacion} · {formatearFecha(p.fecha)}
                </p>
              </div>
              <InsigniaEtapa etapa={p.etapa} despacho={p.despacho} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div>
                <dt className="text-[var(--fg-subtle)]">Total</dt>
                <dd>
                  <Moneda valor={totalVisible(p)} moneda={p.moneda} tamano="sm" />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-subtle)]">Margen</dt>
                <dd>
                  <Margen p={p} />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-subtle)]">Compras</dt>
                <dd>
                  <Compras p={p} />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-subtle)]">Guía</dt>
                <dd>
                  <Guia p={p} />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-subtle)]">Factura · cobro</dt>
                <dd>
                  <Cobro p={p} />
                </dd>
              </div>
              <div>
                <dt className="text-[var(--fg-subtle)]">SUNAT</dt>
                <dd className={SUNAT[sunatDe(p)].clase}>{SUNAT[sunatDe(p)].texto}</dd>
              </div>
            </dl>
            <AccionesPedido p={paraAcciones(p)} ancho />
          </li>
        ))}
      </ul>

      <PaginacionKeyset
        cantidadEnPagina={filas.length}
        cursorSiguiente={pagina.siguiente}
        cursorAnterior={pagina.anterior}
        total={total}
        porPagina={porPagina}
      />
    </div>
  );
}
