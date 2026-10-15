"use client";

// Cliente: el menú se abre y navega con el router.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, EllipsisVertical, Eye, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";

import type { CotizacionLista } from "../dominio/tipos";

/**
 * Las acciones de una cotización en la lista: TODO dentro de un solo menú.
 *
 * Luis, 15/10, al ver «Ver» y «Aprobar» fuera y los tres puntos al lado:
 * *«la idea es que esté adentro todo»*. Y dentro, solo lo que es de la
 * cotización y de sus pedidos: *«duplicar, facturar no sería ahí, porque eso
 * está en pedido»*. La guía, la factura, las compras y repetir el pedido se
 * hacen en la ficha del pedido.
 *
 * El botón lleva su palabra, «Acciones», con borde: tres puntos sueltos no
 * dicen que ahí hay algo que pulsar (revisión por módulos del 02/10).
 */
export function AccionesFilaCotizacion({ c, ancho = false }: { c: CotizacionLista; ancho?: boolean }) {
  const router = useRouter();
  const viva = c.estado === "borrador" || c.estado === "enviada";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={`Acciones de ${c.numero}`}
        className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${ancho ? "w-full" : "ml-auto"}`}
      >
        <EllipsisVertical className="size-4" aria-hidden="true" />
        Acciones
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/* Aprobar, PRIMERO y en verde (Luis, 15/10): es lo que se viene a
            hacer aquí. Aprobar es pasar a pedidos: abre la ficha con «¿Qué te
            confirmó el cliente?» y, al aprobar, lleva al pedido. */}
        {viva ? (
          <DropdownMenuItem
            onSelect={() => router.push(`/cotizaciones/${c.id}?aprobar=1`)}
            className="mb-1 bg-[var(--ok-bg)] font-semibold text-[var(--ok)] focus:bg-[var(--ok-bg)] focus:text-[var(--ok)]"
          >
            <Check className="size-4" aria-hidden="true" />
            Aprobar cotización
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/cotizaciones/${c.id}`}>
            <Eye className="size-4" aria-hidden="true" />
            Ver cotización
          </Link>
        </DropdownMenuItem>
        {viva ? (
          <DropdownMenuItem onSelect={() => router.push(`/cotizaciones/${c.id}/editar`)}>
            <Pencil className="size-4" aria-hidden="true" />
            Editar cotización
          </DropdownMenuItem>
        ) : null}

        {c.pedidos.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-sm font-medium text-[var(--fg-muted)]">
              {c.pedidos.length === 1 ? "Su pedido" : "Sus pedidos"}
            </DropdownMenuLabel>
            {c.pedidos.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => router.push(`/pedidos/${p.id}`)}
                className="font-medium text-brand-700"
              >
                <ClipboardList className="size-4" aria-hidden="true" />
                Ver pedido <span className="font-mono">{p.numero}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
