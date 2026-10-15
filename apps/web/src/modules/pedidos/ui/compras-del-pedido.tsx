import type * as React from "react";
import Link from "next/link";
import { CircleCheck, FileText, Receipt } from "lucide-react";
import { Moneda, buttonVariants, cn, formatearFecha } from "@rodatech/ui";

import type { OrdenDePedido } from "@/modules/compras/api/consultas";
import { ETIQUETA_MODALIDAD, modalidadDe } from "@/modules/compras/dominio/gastos";

/**
 * Las órdenes de compra del pedido (128, 130).
 *
 * Una orden NO es una compra (Luis, 15/10): es lo que se va a pedir, al
 * precio que se analizó al cotizar. Cuando se compra de verdad se registra
 * con su factura: «Registrar compra», que abre el formulario de siempre con
 * los productos puestos.
 */
export function ComprasDelPedido({
  ordenes,
  puede,
  cotizacionId,
  generar,
}: {
  ordenes: OrdenDePedido[];
  puede: boolean;
  cotizacionId: string;
  /**
   * El botón de generar las órdenes, ya montado, cuando queda algo analizado
   * por pedir (15/10). Luis: *«de ahí se hace todo también, ordenar las
   * compras»*.
   */
  generar?: React.ReactNode;
}) {
  const faltan = ordenes.filter((o) => o.falta_factura && o.estado === "registrada").length;

  return (
    <section className="card flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Compras</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            Una orden por proveedor: lo que se va a pedir, al precio analizado. Cuando la compres, regístrala con su
            factura.
          </p>
        </div>
        {generar}
        {ordenes.length > 0 ? (
          <p
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              faltan === 0 ? "border-[var(--ok)] text-[var(--ok)]" : "border-[var(--warn)] bg-[var(--warn-bg)]"
            }`}
          >
            {faltan === 0 ? "Todas compradas" : `${ordenes.length - faltan} de ${ordenes.length} compradas · faltan ${faltan}`}
          </p>
        ) : null}
      </header>

      {ordenes.length === 0 && generar ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          Este pedido todavía no tiene órdenes de compra. El botón de arriba arma una por proveedor con lo que
          apuntaste al cotizar, menos lo ya pedido.
        </p>
      ) : ordenes.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <p>Este pedido no tiene órdenes de compra.</p>
          <p className="text-[var(--fg-muted)]">
            Si lo hay en almacén, se despacha con la guía. Si falta, las órdenes salen desde la cotización, con lo que
            se analizó al cotizar.
          </p>
          <Link href={`/cotizaciones/${cotizacionId}`} className={cn(buttonVariants({ variant: "outline" }), "w-fit px-3")}>
            Ir a la cotización
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {ordenes.map((o, i) => {
            const porRegistrar = o.falta_factura && o.estado === "registrada";
            return (
              <li
                key={o.id}
                className={`flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  porRegistrar ? "border-[var(--warn)]" : "border-[var(--border)]"
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
                  {porRegistrar ? (
                    <p className="mt-1 text-sm font-medium">Pedida · falta registrar la compra</p>
                  ) : (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                      <CircleCheck className="size-4 text-[var(--ok)]" aria-hidden="true" />
                      <span>
                        Comprada · factura <strong className="font-mono">{o.documento_proveedor ?? "—"}</strong> ·{" "}
                        {ETIQUETA_MODALIDAD[modalidadDe(o.tipo, o.via_importacion ?? "aerea")]} · {formatearFecha(o.fecha)} ·
                      </span>
                      <Moneda valor={o.total} moneda={o.moneda} tamano="sm" />
                    </p>
                  )}
                </div>
                {porRegistrar && puede ? (
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
            );
          })}
        </ol>
      )}
    </section>
  );
}
