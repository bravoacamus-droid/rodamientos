import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { buttonVariants, cn, formatearFecha } from "@rodatech/ui";

import type { PedidoLista } from "../api/consultas";
import { InsigniaEtapa } from "./insignia";
import { ChipIcono } from "@/modules/cotizaciones/ui/ficha/piezas";

/**
 * Los pedidos de una cotización, en su ficha (130). La cotización es la
 * plantilla de precios; cada vez que el cliente confirma —al aprobar, o con
 * «Atender otro pedido»— nace uno, con sus compras, su guía y su factura.
 */
export function PedidosDeLaCotizacion({ pedidos }: { pedidos: PedidoLista[] }) {
  if (pedidos.length === 0) return null;
  const orden = [...pedidos].sort((a, b) => a.secuencia - b.secuencia);
  return (
    <section className="card elev-1 flex flex-col gap-3 p-4">
      {/* Un div y no un header (27/11): con el chip, la raya de tokens.css sobra. */}
      <div className="flex flex-wrap items-center gap-3">
        <ChipIcono icono={ClipboardList} chico />
        <h2 className="text-xl font-bold text-[var(--titulo)]">{orden.length === 1 ? "Pedido" : `Pedidos (${orden.length})`}</h2>
        {/* Con varios, la tabla de Pedidos filtrada por esta cotización (15/10). */}
        {orden.length > 1 ? (
          <Link
            href={`/pedidos?cotizacion=${orden[0]!.cotizacionId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto px-3")}
          >
            Ver en Pedidos
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {orden.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/pedidos/${p.id}`} className="font-mono text-lg font-bold text-brand-600 underline-offset-4 hover:underline">
                  {p.numero}
                </Link>
                <span className="text-sm text-[var(--fg-muted)]">confirmado el {formatearFecha(p.fecha)}</span>
              </p>
              <p className="break-words text-sm">{p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {p.anulado ? (
                <span className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] px-2 py-0.5 text-sm font-semibold text-[var(--danger)]">
                  Anulado
                </span>
              ) : (
                <InsigniaEtapa etapa={p.etapa} despacho={p.despacho} />
              )}
              <Link href={`/pedidos/${p.id}`} className={cn(buttonVariants({ variant: "outline" }), "px-4")}>
                Ver pedido
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
