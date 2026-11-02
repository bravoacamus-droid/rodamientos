import Link from "next/link";
import { FilePen } from "lucide-react";
import { Moneda, buttonVariants, cn, formatearFecha } from "@rodatech/ui";

import { borradoresFactura } from "../api/consultas";
import { BorrarBorrador } from "./borrar-borrador";

/**
 * Las facturas en borrador, encima de la lista (176).
 *
 * Willy, 31/10: guardarla *«para que lo mire antes»*. Aquí esperan: sin
 * número, sin SUNAT y fuera de Cobranzas hasta que alguien las abra y las
 * emita. Si no hay ninguna, no se pinta nada.
 */
export async function BorradoresFactura({ puedeEditar }: { puedeEditar: boolean }) {
  const r = await borradoresFactura();
  if (!r.ok || r.datos.length === 0) return null;

  return (
    <section id="borradores" className="card anim-entrada flex scroll-mt-4 flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">
          {r.datos.length === 1 ? "1 factura en borrador" : `${r.datos.length} facturas en borrador`}
        </h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía no tienen número ni están en Cobranzas. Ábrela, revísala y emítela cuando esté bien.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
        {r.datos.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{b.cliente ?? "—"}</span>
              <span className="block text-[var(--fg-muted)]">
                {b.cotizacion_numero ? `Cotización ${b.cotizacion_numero} · ` : ""}
                <Moneda moneda={b.moneda} valor={b.total} tamano="sm" className="text-inherit" />
                {" · guardado el "}
                {formatearFecha(b.actualizado_en.slice(0, 10))}
                {b.creado_por ? ` por ${b.creado_por}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/facturacion/nueva?borrador=${b.id}`}
                className={cn(buttonVariants({ variant: "primary" }), "whitespace-nowrap")}
              >
                <FilePen className="size-4" aria-hidden="true" />
                Revisar y emitir
              </Link>
              {puedeEditar ? <BorrarBorrador id={b.id} cliente={b.cliente ?? "este cliente"} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
