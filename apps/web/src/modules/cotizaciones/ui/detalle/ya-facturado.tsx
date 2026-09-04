import Link from "next/link";
import { Badge, Moneda, formatearFecha } from "@rodatech/ui";

import type { ComprobanteDelPedido } from "../../api/consultas";

/**
 * Lo que ya se le facturó de este pedido.
 *
 * El enlace entre pedido y comprobante existía desde siempre y solo iba en un
 * sentido: la factura decía de qué cotización nacía, y la cotización no sabía
 * nada de sus facturas.
 *
 * Con el facturado por partes (047) eso deja al pedido contando media
 * historia: se le emitió 1 de 5 unidades y la ficha seguía enseñando las 5
 * como si no hubiera pasado nada. Quien la abre no puede saber si ya se cobró
 * algo, ni cuánto queda vivo.
 *
 * El SALDO va al lado del total a propósito: un pedido puede estar facturado
 * entero y sin cobrar un centavo, y son dos situaciones muy distintas.
 *
 * Server Component: son datos, no hay nada que tocar.
 */
export function YaFacturado({
  comprobantes,
}: {
  comprobantes: ComprobanteDelPedido[];
}) {
  if (comprobantes.length === 0) return null;

  const facturado = comprobantes.reduce((a, c) => a + c.total, 0);
  const porCobrar = comprobantes.reduce((a, c) => a + c.saldo, 0);

  return (
    <section className="card p-4 print:hidden">
      <h2 className="mb-1 text-sm font-semibold">Lo que ya se le facturó</h2>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        {comprobantes.length === 1
          ? "Un comprobante salió de este pedido"
          : `${comprobantes.length} comprobantes salieron de este pedido`}
        {porCobrar > 0 ? " · queda saldo por cobrar" : " · todo cobrado"}.
      </p>

      <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
        {comprobantes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <Link
              href={`/facturacion/${c.id}`}
              className="font-mono text-[0.8rem] font-medium text-brand-600 hover:underline"
            >
              {c.numero}
            </Link>
            <span className="text-xs text-[var(--fg-subtle)]">
              {formatearFecha(c.fecha)}
            </span>
            {c.estado_sunat !== "aceptado" ? (
              <Badge tone="neutral" size="xs">
                {c.estado_sunat === "pendiente" ? "sin enviar" : c.estado_sunat}
              </Badge>
            ) : null}

            <span className="ml-auto flex items-center gap-3 text-sm">
              <Moneda valor={c.total} tamano="sm" />
              {c.saldo > 0 ? (
                <span className="text-xs text-[var(--warn)]">
                  debe <Moneda valor={c.saldo} tamano="sm" />
                </span>
              ) : (
                <span className="text-xs text-[var(--ok)]">cobrado</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {comprobantes.length > 1 ? (
        <p className="mt-2 border-t border-[var(--border-soft)] pt-2 text-sm">
          <span className="text-[var(--fg-muted)]">Facturado en total </span>
          <Moneda valor={facturado} tamano="sm" />
          {porCobrar > 0 ? (
            <>
              <span className="text-[var(--fg-muted)]"> · por cobrar </span>
              <Moneda valor={porCobrar} tamano="sm" />
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
