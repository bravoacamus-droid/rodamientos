import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { buttonVariants, cn, formatearFecha } from "@rodatech/ui";

import type { PedidoLista } from "../api/consultas";
import { InsigniaEtapa } from "./insignia";

/**
 * Los pedidos de una cotización, en su ficha (130). La cotización es la
 * plantilla de precios; cada vez que el cliente confirma —al aprobar, o con
 * «Atender otro pedido»— nace uno, con sus compras, su guía y su factura.
 */
export function PedidosDeLaCotizacion({ pedidos }: { pedidos: PedidoLista[] }) {
  if (pedidos.length === 0) return null;
  const orden = [...pedidos].sort((a, b) => a.secuencia - b.secuencia);
  return (
    <section className="card flex flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <ClipboardList className="size-5 text-brand-600" aria-hidden="true" />
        <h2 className="text-base font-semibold">{orden.length === 1 ? "Pedido" : `Pedidos (${orden.length})`}</h2>
        {/* Con varios, la tabla de Pedidos filtrada por esta cotización (15/10). */}
        {orden.length > 1 ? (
          <Link
            href={`/pedidos?cotizacion=${orden[0]!.cotizacionId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto px-3")}
          >
            Ver en Pedidos
          </Link>
        ) : null}
      </header>
      <ul className="flex flex-col gap-2">
        {orden.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/pedidos/${p.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                  {p.numero}
                </Link>
                <span className="text-sm text-[var(--fg-muted)]">confirmado el {formatearFecha(p.fecha)}</span>
              </p>
              <p className="truncate text-sm">{p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaEtapa etapa={p.etapa} />
              <Link href={`/pedidos/${p.id}`} className={cn(buttonVariants({ variant: "outline" }), "px-4")}>
                Ver pedido
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
