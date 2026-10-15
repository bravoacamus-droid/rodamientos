"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button, Input, SelectNativo, formatearFecha, formatearMoneda } from "@rodatech/ui";

import { PaginasLista, trozo } from "@/componentes/paginas-lista";

import type { CompraDeProveedor } from "../../api/ejecutivo";

const VIA: Record<string, string> = { local: "Local", aerea: "Aérea", maritima: "Marítima", importacion: "Importación" };
const TAMANO = 15;

type Estado = "registrar" | "recibir" | "parcial" | "recibida";
function estadoDe(c: CompraDeProveedor): Estado {
  if (c.faltaFactura && c.estado === "registrada") return "registrar";
  if (c.estado === "registrada") return "recibir";
  if (c.estado === "recibida_parcial") return "parcial";
  return "recibida";
}
const ESTADO: Record<Estado, { texto: string; tono: string }> = {
  registrar: { texto: "Falta registrar", tono: "font-medium text-[var(--warn)]" },
  recibir: { texto: "Por recibir", tono: "" },
  parcial: { texto: "Recibida en parte", tono: "" },
  recibida: { texto: "Recibida", tono: "text-[var(--ok)]" },
};

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Las compras de un proveedor en su ficha (134), con buscador, estado, vía y
 * páginas (Luis, 15/10: *«buscar el producto, filtrar… ordenarlo también,
 * porque es una lista grande y puede crecer»*).
 */
export function ComprasDelProveedorLista({ compras }: { compras: CompraDeProveedor[] }) {
  const [q, setQ] = React.useState("");
  const [estado, setEstado] = React.useState("");
  const [via, setVia] = React.useState("");
  const [orden, setOrden] = React.useState("reciente");
  const [pagina, setPagina] = React.useState(1);
  React.useEffect(() => setPagina(1), [q, estado, via, orden]);

  const visibles = React.useMemo(() => {
    const t = sinTildes(q.trim());
    const f = compras.filter(
      (c) =>
        (!t || sinTildes(`${c.numero} ${c.factura ?? ""} ${c.pedido?.numero ?? ""} ${c.productos}`).includes(t)) &&
        (!estado || estadoDe(c) === estado) &&
        (!via || c.via === via),
    );
    return [...f].sort((a, b) =>
      orden === "monto"
        ? b.totalUsd - a.totalUsd
        : orden === "antigua"
          ? a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero)
          : b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero),
    );
  }, [compras, q, estado, via, orden]);
  const enPagina = trozo(visibles, pagina, TAMANO);
  const filtrando = Boolean(q.trim() || estado || via);
  const vias = [...new Set(compras.map((c) => c.via))];

  if (compras.length === 0) {
    return <p className="py-6 text-center text-base text-[var(--fg-muted)]">Ninguna compra en este periodo.</p>;
  }

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block">
          <span className="sr-only">Buscar en sus compras</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Compra, factura, pedido o código" className="pl-9" />
        </label>
        <SelectNativo value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Estado: todos</option>
          {(Object.keys(ESTADO) as Estado[]).map((k) => (
            <option key={k} value={k}>
              {ESTADO[k].texto}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo value={via} onChange={(e) => setVia(e.target.value)} aria-label="Vía">
          <option value="">Vía: todas</option>
          {vias.map((v) => (
            <option key={v} value={v}>
              {VIA[v] ?? v}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
          <option value="reciente">Las últimas primero</option>
          <option value="antigua">Las más antiguas primero</option>
          <option value="monto">Las más grandes primero</option>
        </SelectNativo>
        {filtrando ? (
          <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)] sm:col-span-2 lg:col-span-4">
            {visibles.length} de {compras.length}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQ("");
                setEstado("");
                setVia("");
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
          Ninguna compra coincide con esos filtros.
        </p>
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
                {enPagina.filas.map((c) => {
                  const e = ESTADO[estadoDe(c)];
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
                      <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-semibold">{formatearMoneda(c.totalUsd)}</td>
                      <td className={`whitespace-nowrap py-2.5 pl-3 ${e.tono}`}>{e.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 @3xl:hidden">
            {enPagina.filas.map((c) => {
              const e = ESTADO[estadoDe(c)];
              return (
                <li key={c.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/compras/${c.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                      {c.numero}
                    </Link>
                    <span className="tabular font-semibold">{formatearMoneda(c.totalUsd)}</span>
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
          <PaginasLista pagina={enPagina.pagina} tamano={TAMANO} total={visibles.length} onCambiar={setPagina} />
        </>
      )}
    </div>
  );
}
