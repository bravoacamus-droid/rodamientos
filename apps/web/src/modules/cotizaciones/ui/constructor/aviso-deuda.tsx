"use client";

import * as React from "react";
import Link from "next/link";
import { formatearMoneda } from "@rodatech/ui";
import { TriangleAlert } from "lucide-react";

import { deudaDelCliente, type DeudaCliente } from "../../acciones/buscar";

/**
 * «Este cliente tiene facturas vencidas», dicho al elegirlo (23/10).
 *
 * Solo aparece si hay algo VENCIDO: lo que todavía está en plazo no es una
 * noticia y llenaría la pantalla de avisos para cada cliente a crédito. Y no
 * bloquea nada: es información para quien decide, con el enlace a su estado
 * de cuenta para verlo entero.
 */
export function AvisoDeuda({ clienteId }: { clienteId: string | null }) {
  const [deuda, setDeuda] = React.useState<{ id: string; datos: DeudaCliente } | null>(null);

  React.useEffect(() => {
    if (!clienteId) return;
    let vigente = true;
    void deudaDelCliente(clienteId).then((r) => {
      if (vigente && r.ok) setDeuda({ id: clienteId, datos: r.datos });
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  // Lo leído es de OTRO cliente si se cambió mientras llegaba.
  if (!clienteId || !deuda || deuda.id !== clienteId || deuda.datos.vencido <= 0) return null;
  const d = deuda.datos;

  return (
    <div
      role="status"
      className="mt-3 flex flex-col gap-2 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden />
        <span>
          <strong>Este cliente tiene {formatearMoneda(d.vencido)} vencidos</strong> en{" "}
          {d.documentosVencidos === 1 ? "1 factura" : `${d.documentosVencidos} facturas`}; la más
          atrasada, de hace {d.diasMasAtrasado} {d.diasMasAtrasado === 1 ? "día" : "días"}.
          {d.total > d.vencido ? ` En total debe ${formatearMoneda(d.total)}.` : ""}
        </span>
      </p>
      <Link
        href={`/cobranzas/estado-de-cuenta?cliente=${clienteId}`}
        target="_blank"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 font-medium hover:bg-[var(--surface-2)]"
      >
        Ver su cuenta
      </Link>
    </div>
  );
}
