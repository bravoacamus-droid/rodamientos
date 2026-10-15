import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, FileText, Receipt } from "lucide-react";
import { EstadoError, Moneda, buttonVariants, cn, formatearFecha } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { Volver } from "@/componentes/volver";
import { ordenesDeLaCotizacion } from "../api/consultas";
import { ETIQUETA_MODALIDAD, modalidadDe } from "../dominio/gastos";

const ROLES = ["gerencia", "admin", "compras"];

/**
 * Las compras de un pedido, juntas (128).
 *
 * Luis, 15/10: *«lo que yo quiero englobar es cotización y cliente, porque
 * puede tener varios proveedores, y un producto puede tener dos proveedores:
 * significa que es otra orden… si una cotización tiene tres órdenes, se junta
 * eso, pero cada orden es diferente»*.
 *
 * Una orden NO es una compra (Luis, 15/10): es lo que se va a pedir, al
 * precio que se analizó al cotizar. Cuando se compra de verdad se registra
 * con su factura: «Registrar compra». Arriba, cuántas faltan.
 */
export default async function PaginaPedidoCompras({ params }: { params: Promise<{ cotizacionId: string }> }) {
  const { cotizacionId } = await params;
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  const puede = ROLES.includes(perfil.rol);

  const r = await ordenesDeLaCotizacion(cotizacionId);
  if (!r.ok) return <EstadoError titulo="No se pudo cargar el pedido" detalle={r.error} />;
  if (!r.datos) notFound();
  const p = r.datos;
  const faltan = p.ordenes.filter((o) => o.falta_factura);
  const hechas = p.ordenes.length - faltan.length;

  return (
    <div className="flex flex-col gap-5">
      <Volver href={`/cotizaciones/${p.cotizacionId}`}>Volver a {p.cotizacion}</Volver>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--fg-subtle)]">Compras del pedido</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.cotizacion} · {p.cliente}
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Una orden por proveedor: lo que se va a pedir, al precio analizado. Cuando la compres,
            regístrala con su factura.
          </p>
        </div>
        {p.ordenes.length > 0 ? (
          <p
            className={`rounded-md border px-3 py-2 text-base font-semibold ${
              faltan.length === 0
                ? "border-[var(--ok)] text-[var(--ok)]"
                : "border-[var(--warn)] bg-[var(--warn-bg)]"
            }`}
          >
            {faltan.length === 0
              ? "Todas compradas"
              : `${hechas} de ${p.ordenes.length} compradas · faltan ${faltan.length}`}
          </p>
        ) : null}
      </header>

      {p.ordenes.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-base font-medium">Este pedido todavía no tiene órdenes de compra.</p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Se generan desde la cotización, cuando el cliente confirma.
          </p>
          <Link href={`/cotizaciones/${p.cotizacionId}`} className={cn(buttonVariants(), "mt-3 px-4")}>
            Ir a la cotización
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {p.ordenes.map((o, i) => (
            <li
              key={o.id}
              className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                o.falta_factura ? "border-[var(--warn)]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                    Orden {i + 1}
                  </span>
                  <span className="text-base font-semibold">{o.proveedor}</span>
                  <Link href={`/compras/${o.id}`} className="font-mono text-sm text-brand-600 hover:underline">
                    {o.numero}
                  </Link>
                </p>
                <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
                  {o.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · ")}
                </p>
                {o.falta_factura ? (
                  <p className="mt-1 text-sm font-medium">Pedida · falta registrar la compra</p>
                ) : (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                    <CircleCheck className="size-4 text-[var(--ok)]" aria-hidden="true" />
                    <span>
                      Comprada · factura <strong className="font-mono">{o.documento_proveedor ?? "—"}</strong> ·{" "}
                      {ETIQUETA_MODALIDAD[modalidadDe(o.tipo, o.via_importacion ?? "aerea")]} ·{" "}
                      {formatearFecha(o.fecha)} ·
                    </span>
                    <Moneda valor={o.total} moneda={o.moneda} tamano="sm" />
                  </p>
                )}
              </div>
              {o.falta_factura && o.estado === "registrada" && puede ? (
                <Link href={`/compras/${o.id}/factura`} className={cn(buttonVariants(), "h-11 px-5 text-base")}>
                  <Receipt className="size-5" aria-hidden="true" />
                  Registrar compra
                </Link>
              ) : (
                <Link href={`/compras/${o.id}`} className={cn(buttonVariants({ variant: "outline" }), "px-4")}>
                  <FileText className="size-4" aria-hidden="true" />
                  Ver la compra
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
