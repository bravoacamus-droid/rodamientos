"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button, Input, Moneda, SelectNativo, formatearFecha } from "@rodatech/ui";

import { PaginasLista, trozo } from "@/componentes/paginas-lista";
import { ETAPAS, ETIQUETA_ETAPA } from "@/modules/pedidos/dominio/etapa";
import { cobroDe, margenPct, totalVisible, type FilaPedido } from "@/modules/pedidos/dominio/lista";
import { InsigniaEtapa } from "@/modules/pedidos/ui/insignia";

const TAMANO = 15;

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Los pedidos de un cliente en su ficha (134), con buscador, etapa, orden y
 * páginas: un cliente fiel junta decenas (REACTIVOS, 51 en un año).
 */
export function PedidosDelClienteLista({ pedidos }: { pedidos: FilaPedido[] }) {
  const [q, setQ] = React.useState("");
  const [etapa, setEtapa] = React.useState("");
  const [orden, setOrden] = React.useState("reciente");
  const [pagina, setPagina] = React.useState(1);
  React.useEffect(() => setPagina(1), [q, etapa, orden]);

  const visibles = React.useMemo(() => {
    const t = sinTildes(q.trim());
    const f = pedidos.filter(
      (p) =>
        (!t || sinTildes(`${p.numero} ${p.cotizacion} ${p.productos.map((x) => x.codigo).join(" ")}`).includes(t)) &&
        (!etapa || p.etapa === etapa),
    );
    return [...f].sort((a, b) =>
      orden === "monto"
        ? b.venta - a.venta
        : orden === "margen"
          ? (margenPct(b.venta, b.costo) ?? -Infinity) - (margenPct(a.venta, a.costo) ?? -Infinity)
          : b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero),
    );
  }, [pedidos, q, etapa, orden]);
  const enPagina = trozo(visibles, pagina, TAMANO);
  const filtrando = Boolean(q.trim() || etapa);
  const etapas = ETAPAS.filter((e) => pedidos.some((p) => p.etapa === e));

  if (pedidos.length === 0) {
    return <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ningún pedido en este periodo.</p>;
  }

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Buscar en sus pedidos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pedido, cotización o código" className="pl-9" />
        </label>
        <SelectNativo value={etapa} onChange={(e) => setEtapa(e.target.value)} aria-label="Etapa">
          <option value="">Etapa: todas</option>
          {etapas.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ETAPA[e]}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
          <option value="reciente">Los últimos primero</option>
          <option value="monto">Los más grandes primero</option>
          <option value="margen">El mejor margen primero</option>
        </SelectNativo>
        {filtrando ? (
          <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)] sm:col-span-2 lg:col-span-3">
            {visibles.length} de {pedidos.length}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQ("");
                setEtapa("");
              }}
            >
              <X aria-hidden="true" />
              Quitar filtros
            </Button>
          </p>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          Ningún pedido coincide con esos filtros.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {enPagina.filas.map((p) => {
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
      <PaginasLista pagina={enPagina.pagina} tamano={TAMANO} total={visibles.length} onCambiar={setPagina} />
    </div>
  );
}
