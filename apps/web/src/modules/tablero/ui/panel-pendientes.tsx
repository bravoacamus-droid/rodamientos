import Link from "next/link";
import { ArrowRight, CircleCheck, ClipboardList, Clock, TriangleAlert } from "lucide-react";
import { buttonVariants, cn } from "@rodatech/ui";

import { pendientesDelDia, type FilaDelDia } from "@/modules/alertas";

/**
 * «Lo que se está quedando atrás» (161).
 *
 * Luis, 27/10: *«que me avise que tengo cotizaciones sin cerrar o aprobar,
 * que no se haya sacado una guía… que el app sea interactivo y ayude al sr
 * Willy en su día a día»*.
 *
 * Va arriba del todo y sin el filtro de fechas: lo pendiente es de hoy. El
 * panel de alertas de abajo enseña las seis más graves de todo; este, la
 * cuenta de lo que nadie ha hecho todavía, que no es grave hasta que lo es.
 *
 * Rediseño del 27/11 (el supervisor: «muy plano, neutral»). Era una lista de
 * frases con la cifra metida dentro, todas con el mismo peso y un «Ver» de
 * contorno. Ahora cada cosa es una tarjeta con la cifra GRANDE, aparte de la
 * frase, y con su urgencia dicha dos veces: con color y con palabra e icono,
 * porque el color solo no lo distingue todo el mundo (ni en contraste alto).
 */

/**
 * Lo que ya está costando algo: una cotización vencida es una venta que se
 * va, y una compra que no llega es un cliente esperando. El resto es trabajo
 * por hacer que todavía está a tiempo.
 */
const URGENTES = new Set<FilaDelDia["tipo"]>(["cotizaciones_sin_cerrar", "compra_sin_recibir"]);

export async function PanelPendientes() {
  const r = await pendientesDelDia();
  // Si falla la lectura no se pinta nada: decir «Todo al día» sin saberlo
  // sería mentir, y el panel de alertas de abajo ya avisa de su propio error.
  if (!r.ok) return null;
  const filas = r.datos;

  if (filas.length === 0) {
    return (
      <section className="card elev-1 flex items-center gap-3 border-l-4 border-l-[var(--ok)] bg-ok-bg px-5 py-4">
        <CircleCheck className="size-7 shrink-0 text-ok" aria-hidden="true" />
        <p className="text-lg font-semibold">
          Todo al día: no hay cotizaciones, pedidos, compras ni guías esperando.
        </p>
      </section>
    );
  }

  const total = filas.reduce((s, f) => s + f.cuantas, 0);

  return (
    <section aria-labelledby="pendientes-titulo" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-warn-bg text-warn ring-1 ring-inset ring-[var(--warn)]/25">
          <ClipboardList className="size-6" aria-hidden="true" />
        </span>
        <h2 id="pendientes-titulo" className="text-xl font-bold text-[var(--titulo)]">
          Lo que se está quedando atrás
        </h2>
        {/* Letra en --fg-inverso y no en blanco: en oscuro el ámbar es claro
            (#e0b13a) y el blanco encima daba 2:1. */}
        <span className="tabular rounded-full bg-warn px-3 py-0.5 text-base font-bold text-[var(--fg-inverso)]">
          {total.toLocaleString("es-PE")} {total === 1 ? "cosa por hacer" : "cosas por hacer"}
        </span>
      </header>

      <ul className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
        {filas.map((f) => (
          <Pendiente key={f.tipo} fila={f} urgente={URGENTES.has(f.tipo)} />
        ))}
      </ul>
    </section>
  );
}

function Pendiente({ fila, urgente }: { fila: FilaDelDia; urgente: boolean }) {
  const Icono = urgente ? TriangleAlert : Clock;
  return (
    <li
      className={cn(
        "card elev-2 anim-escalon flex flex-wrap items-center gap-x-4 gap-y-3 border-l-[6px] p-4",
        urgente ? "border-l-[var(--danger)] bg-danger-bg" : "border-l-[var(--warn)] bg-warn-bg",
      )}
    >
      <span
        className={cn(
          "tabular min-w-[3ch] text-center text-5xl font-extrabold leading-none tracking-tight",
          urgente ? "text-danger" : "text-warn",
        )}
      >
        {fila.cuantas.toLocaleString("es-PE")}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide",
            urgente ? "text-danger" : "text-warn",
          )}
        >
          <Icono className="size-4" aria-hidden="true" />
          {urgente ? "Urgente" : "Por hacer"}
        </p>
        <p className="text-lg font-semibold leading-snug text-fg first-letter:uppercase">{fila.frase}</p>
      </div>
      <Link
        href={fila.enlace}
        aria-label={`Ver: ${fila.texto}`}
        className={cn("ml-auto shrink-0", buttonVariants({ variant: urgente ? "danger" : "primary", size: "lg" }), "text-base")}
      >
        Ver
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}
