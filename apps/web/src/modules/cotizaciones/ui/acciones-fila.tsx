"use client";

// Cliente: el menú de tres puntos y «Duplicar», que llama a una Server Action
// y lleva a la copia.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Copy, EllipsisVertical, Eye, Pencil, Receipt, Truck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";

import { clonar } from "../acciones/gestionar";
import type { CotizacionLista } from "../dominio/tipos";

/**
 * Las acciones de una cotización en la lista: «Ver», el paso siguiente y el
 * resto en el menú de tres puntos.
 *
 * Luis, 15/10: *«debería haber otro botón para aprobar cotización o poner un
 * tres puntos, y ahí está ver cotización, aprobar cotización, duplicar,
 * facturar; porque el aprobar es pasar a pedidos»*. Y: *«solo se puede
 * facturar si tiene guía; si no, no»*.
 *
 * Por eso el paso siguiente cambia con el estado: en una cotización viva es
 * «Aprobar» (abre la ficha con el diálogo de qué confirmó el cliente), y en
 * una aprobada es «Pedido», que es donde se hace todo lo demás. «Facturar»
 * solo se ofrece con la guía emitida; sin ella sale apagado y dice por qué.
 */
export function AccionesFilaCotizacion({ c, ancho = false }: { c: CotizacionLista; ancho?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const viva = c.estado === "borrador" || c.estado === "enviada";
  const p = c.pedido;
  const puedeFacturar = Boolean(p && p.guiaEmitida && !p.facturado);

  const duplicar = () => {
    setError(null);
    iniciar(async () => {
      const r = await clonar(c.id);
      if (!r.ok) setError(r.error ?? "No se pudo duplicar.");
      else if (r.id) router.push(`/cotizaciones/${r.id}`);
    });
  };

  return (
    <div className={ancho ? "flex w-full flex-col gap-1" : "flex flex-col items-end gap-1"}>
      <div className={ancho ? "flex w-full items-center gap-2" : "grid w-[268px] grid-cols-[84px_1fr_36px] gap-1.5"}>
        <Link href={`/cotizaciones/${c.id}`} className={`${SECUNDARIO} ${ancho ? "flex-1" : "w-full"} justify-center`}>
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          Ver
        </Link>

        {viva ? (
          <Link
            href={`/cotizaciones/${c.id}?aprobar=1`}
            className={`${PRINCIPAL} ${ancho ? "flex-1" : "w-full"} justify-center`}
          >
            <Check className="size-4 shrink-0" aria-hidden="true" />
            Aprobar
          </Link>
        ) : p ? (
          <Link href={`/pedidos/${p.id}`} className={`${PRINCIPAL} ${ancho ? "flex-1" : "w-full"} justify-center`}>
            <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
            Pedido
          </Link>
        ) : (
          // Sin paso siguiente el hueco se queda: es lo que mantiene la
          // columna a plomo entre filas (Luis, 08/09: «los botones no cuadran»).
          <span className={ancho ? "hidden" : ""} />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            aria-label={`Más acciones de ${c.numero}`}
            title="Más acciones"
            disabled={pendiente}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${ancho ? "px-3" : "w-9"}`}
          >
            <EllipsisVertical className="size-4" aria-hidden="true" />
            {ancho ? "Más" : null}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => router.push(`/cotizaciones/${c.id}`)}>
              <Eye className="size-4" aria-hidden="true" />
              Ver cotización
            </DropdownMenuItem>
            {viva ? (
              <>
                <DropdownMenuItem onSelect={() => router.push(`/cotizaciones/${c.id}/editar`)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Editar cotización
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(`/cotizaciones/${c.id}?aprobar=1`)}>
                  <Check className="size-4" aria-hidden="true" />
                  Aprobar cotización
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem disabled={pendiente} onSelect={duplicar}>
              <Copy className="size-4" aria-hidden="true" />
              Duplicar
              <span className="ml-auto text-sm text-[var(--fg-subtle)]">precios de hoy</span>
            </DropdownMenuItem>

            {p ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push(`/pedidos/${p.id}`)}>
                  <ClipboardList className="size-4" aria-hidden="true" />
                  Ver pedido {p.numero}
                </DropdownMenuItem>
                {!p.guiaEmitida ? (
                  <DropdownMenuItem onSelect={() => router.push(`/guias/nueva?cotizacion=${c.id}`)}>
                    <Truck className="size-4" aria-hidden="true" />
                    Hacer la guía
                  </DropdownMenuItem>
                ) : null}
                {puedeFacturar ? (
                  <DropdownMenuItem
                    onSelect={() => router.push(`/facturacion/nueva?cotizacion=${c.id}&guia=${p.guiaEmitida}`)}
                  >
                    <Receipt className="size-4" aria-hidden="true" />
                    Facturar
                  </DropdownMenuItem>
                ) : !p.facturado ? (
                  <DropdownMenuItem disabled className="flex-col items-start gap-0">
                    <span className="inline-flex items-center gap-2">
                      <Receipt className="size-4" aria-hidden="true" />
                      Facturar
                    </span>
                    <span className="pl-6 text-sm">Primero hay que emitir la guía</span>
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {pendiente ? <span className="text-sm text-[var(--fg-muted)]">Duplicando…</span> : null}
      {error ? <span className="text-sm text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}

const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

const PRINCIPAL =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";
