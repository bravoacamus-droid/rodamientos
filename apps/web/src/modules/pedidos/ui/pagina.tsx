import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, buttonVariants, cn, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { listarPedidos } from "../api/consultas";
import { ETAPAS, ETIQUETA_ETAPA, type Etapa } from "../dominio/etapa";
import { InsigniaEtapa } from "./insignia";
import { PestanasPedidos } from "./pestanas";

/**
 * Pedidos (130). Antes «Listos para entregar», que solo enseñaba una etapa.
 *
 * Luis, 15/10: *«en vez de listo para entregar sería pedidos, porque la
 * cotización puede duplicarse, se puede utilizar de nuevo, pero el pedido ya
 * es cuando se aprobó»*. Cada fila es una confirmación del cliente, con el
 * paso que le toca. «Listos para entregar» sigue, como pestaña: es el reparto
 * del almacén entre los pedidos que esperan.
 */
export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");

  const sp = await searchParams;
  const crudo = Array.isArray(sp.etapa) ? sp.etapa[0] : sp.etapa;
  const etapa = ETAPAS.find((e) => e === crudo) ?? null;

  const r = await listarPedidos();
  if (!r.ok) return <EstadoError titulo="No se pudieron cargar los pedidos" detalle={r.error} />;

  const cuenta = new Map<Etapa, number>();
  for (const p of r.datos) cuenta.set(p.etapa, (cuenta.get(p.etapa) ?? 0) + 1);
  const filas = etapa ? r.datos.filter((p) => p.etapa === etapa) : r.datos;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Cada vez que un cliente confirma, nace un pedido: se compra lo que falta, se despacha con su guía, se
          factura y se cobra.
        </p>
      </div>

      <PestanasPedidos activa="todos" />

      {/* Los filtros son las etapas, con cuántos hay en cada una. */}
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por etapa">
        <Link
          href="/pedidos"
          className={cn(buttonVariants({ variant: etapa ? "outline" : "primary", size: "sm" }), "px-3")}
        >
          Todos ({r.datos.length})
        </Link>
        {ETAPAS.filter((e) => (cuenta.get(e) ?? 0) > 0).map((e) => (
          <Link
            key={e}
            href={`/pedidos?etapa=${e}`}
            className={cn(buttonVariants({ variant: etapa === e ? "primary" : "outline", size: "sm" }), "px-3")}
          >
            {ETIQUETA_ETAPA[e]} ({cuenta.get(e)})
          </Link>
        ))}
      </nav>

      {filas.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-base font-medium">
            {r.datos.length === 0 ? "Todavía no hay pedidos." : "No hay pedidos en esta etapa."}
          </p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Un pedido nace al aprobar una cotización, o con «Atender otro pedido» desde una ya atendida.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((p) => (
            <li key={p.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/pedidos/${p.id}`} className="font-mono text-base font-semibold text-brand-600 hover:underline">
                    {p.numero}
                  </Link>
                  <span className="text-base font-semibold">{p.cliente}</span>
                </p>
                <p className="text-sm text-[var(--fg-muted)]">
                  {p.secuencia > 1 ? `Pedido ${p.secuencia} de ` : "De "}
                  {p.cotizacion} · {formatearFecha(p.fecha)}
                </p>
                <p className="mt-0.5 truncate text-sm">{p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <InsigniaEtapa etapa={p.etapa} />
                <Link href={`/pedidos/${p.id}`} className={cn(buttonVariants({ variant: "outline" }), "px-4")}>
                  Ver pedido
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
