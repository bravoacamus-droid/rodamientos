"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EstadoBadge,
  formatearFecha,
} from "@rodatech/ui";

import { faltaComprar, otrosPedidos, type DemandaProducto, type PedidoDelProducto } from "../dominio/demanda";

/**
 * «Este producto está en otras cotizaciones» y su «Ver» (Luis, 09/10).
 *
 * Pequeño, pero un botón con borde: lo que Willy no ve como botón no existe
 * (CLAUDE.md §1). Dentro, a qué cliente y en qué cotización; las aprobadas
 * cuentan para comprar y las demás se enseñan aparte, porque el cliente
 * todavía no ha confirmado si se lleva todo o una parte.
 */
export function OtrosPedidos({
  demanda,
  actual,
  codigo,
}: {
  demanda: DemandaProducto | undefined;
  /** La cotización que se está mirando: no se cuenta como «otra». */
  actual: string | null;
  codigo: string;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const otros = otrosPedidos(demanda, actual);
  if (!demanda || otros.total === 0) return null;

  const falta = faltaComprar(demanda);
  const etiqueta =
    otros.aprobadas.length > 0
      ? `${otros.cantidadAprobada} más en ${otros.aprobadas.length === 1 ? "otro pedido" : `${otros.aprobadas.length} pedidos`}`
      : `En ${otros.total === 1 ? "otra cotización" : `${otros.total} cotizaciones más`}`;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
        className={`h-auto gap-1.5 py-1 ${otros.aprobadas.length > 0 ? "border-[var(--warn)] text-[var(--warn)]" : ""}`}
      >
        <Users className="size-4 shrink-0" aria-hidden="true" />
        {etiqueta} · Ver
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent ancho="max-w-2xl">
          <DialogHeader>
            <DialogTitle>¿Quién más pide {codigo}?</DialogTitle>
            <DialogDescription>
              Las aprobadas cuentan para comprar. Las demás todavía no: el cliente no ha confirmado.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Lista titulo="Aprobadas — cuentan para comprar" pedidos={otros.aprobadas} vacio="Ninguna otra aprobada." />
            {otros.sinConfirmar.length > 0 ? (
              <Lista titulo="Sin confirmar — no cuentan todavía" pedidos={otros.sinConfirmar} vacio="" />
            ) : null}
            <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
              Todos los pedidos aprobados piden{" "}
              <strong className="tabular">{demanda.aprobadas.reduce((s, p) => s + p.cantidad, 0)}</strong>; hay{" "}
              <strong className="tabular">{demanda.stock}</strong> en stock y{" "}
              <strong className="tabular">{demanda.enCamino}</strong> en camino.{" "}
              {falta > 0 ? (
                <>
                  Hay que comprar <strong className="tabular">{falta}</strong>.
                </>
              ) : (
                <>No hace falta comprar más.</>
              )}
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Lista({ titulo, pedidos, vacio }: { titulo: string; pedidos: PedidoDelProducto[]; vacio: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {pedidos.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">{vacio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
          {pedidos.map((p) => (
            <li key={p.cotizacionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <Link
                href={`/cotizaciones/${p.cotizacionId}`}
                target="_blank"
                className="font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                {p.numero}
              </Link>
              <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
              <span className="text-sm text-[var(--fg-muted)]">{formatearFecha(p.fecha)}</span>
              <strong className="tabular">{p.cantidad}</strong>
              <EstadoBadge estado={p.estado} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
