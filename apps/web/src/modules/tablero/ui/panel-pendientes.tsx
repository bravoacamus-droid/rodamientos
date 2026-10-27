import Link from "next/link";
import { ArrowRight, CircleCheck, ClipboardList } from "lucide-react";
import { buttonVariants } from "@rodatech/ui";

import { pendientesDelDia } from "@/modules/alertas";

/**
 * «Lo que se está quedando atrás» (161).
 *
 * Luis, 27/10: *«que me avise que tengo cotizaciones sin cerrar o aprobar,
 * que no se haya sacado una guía… que el app sea interactivo y ayude al sr
 * Willy en su día a día»*.
 *
 * Va arriba del todo y sin el filtro de fechas: lo pendiente es de hoy. Una
 * frase por cosa, con la cifra grande y un botón «Ver» con palabra. El panel
 * de alertas de abajo enseña las seis más graves de todo; este, la cuenta de
 * lo que nadie ha hecho todavía, que no es grave hasta que lo es.
 */
export async function PanelPendientes() {
  const r = await pendientesDelDia();
  // Si falla la lectura no se pinta nada: decir «Todo al día» sin saberlo
  // sería mentir, y el panel de alertas de abajo ya avisa de su propio error.
  if (!r.ok) return null;
  const filas = r.datos;

  return (
    <section className="card">
      <header className="flex items-center gap-2 border-b border-[var(--border-soft)] px-4 py-3">
        <ClipboardList className="size-5 text-[var(--fg-muted)]" aria-hidden="true" />
        <h2 className="text-base font-semibold">Lo que se está quedando atrás</h2>
      </header>

      {filas.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-base">
          <CircleCheck className="size-5 text-[var(--ok)]" aria-hidden="true" />
          Todo al día: no hay cotizaciones, pedidos, compras ni guías esperando.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {filas.map((f) => (
            <li key={f.tipo} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1 basis-56 text-base">{f.texto}</span>
              <Link
                href={f.enlace}
                aria-label={`Ver: ${f.texto}`}
                className={`ml-auto shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
              >
                Ver
                <ArrowRight aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
