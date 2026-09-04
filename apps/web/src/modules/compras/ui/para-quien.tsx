import Link from "next/link";
import { Badge, formatearFecha } from "@rodatech/ui";
import { TriangleAlert } from "lucide-react";

import { alcanzaPara, type QuienEsperaProducto } from "../dominio/listos";
import { ETIQUETA_URGENCIA } from "../dominio/por-comprar";

/**
 * Para quién es esta compra.
 *
 * ---------------------------------------------------------------------------
 * El eslabón que faltaba
 * ---------------------------------------------------------------------------
 * La cadena terminaba en el almacén. Se compraba, llegaba la mercadería, subía
 * el stock — y el cliente que había empezado todo desaparecía del sistema. Que
 * esas 8 unidades ya tuvieran dueño vivía en la cabeza de Willy, y quien
 * recibía la caja días después no tenía cómo saberlo.
 *
 * Aquí eso está escrito, y con dos cosas que la lista sola no dice:
 *
 * - **Cuánto espera cada uno**, no solo quién.
 * - **Si lo que traes alcanza.** Comprar 30 para 35 unidades comprometidas
 *   deja a un cliente fuera, y eso hay que verlo con la compra delante — no
 *   cuando llame preguntando.
 *
 * ---------------------------------------------------------------------------
 * Dice «lo esperan», nunca «es suyo»
 * ---------------------------------------------------------------------------
 * Y es a propósito. Mientras `stock.reservado` no lo escriba nadie —la
 * pregunta 4 a Willy— el reparto por antigüedad es un cálculo, no una decisión
 * que alguien haya tomado. «Lo esperan» es un hecho; «es suyo» sería prometer
 * en nombre de Willy.
 *
 * Server Component: son datos, no hay nada que tocar.
 */
export function ParaQuienEs({
  lineas,
  espera,
}: {
  lineas: { producto_id: string; codigo: string; cantidad: number }[];
  espera: Record<string, QuienEsperaProducto>;
}) {
  const conDuenno = lineas.filter((l) => espera[l.producto_id]);

  if (conDuenno.length === 0) {
    return (
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Para quién es</h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Ningún pedido confirmado está esperando esto. Es reposición de
          almacén, que también está bien.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Para quién es</h2>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        Pedidos confirmados que esperan esto y que el almacén todavía no cubre.
      </p>

      <ul className="flex flex-col gap-3">
        {conDuenno.map((l) => {
          const e = espera[l.producto_id]!;
          const alcance = alcanzaPara(l.cantidad, e);
          return (
            <li key={l.producto_id} className="border-b border-[var(--border-soft)] pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[0.8rem] font-medium">{l.codigo}</span>
                <span className="text-xs text-[var(--fg-subtle)]">
                  traes {l.cantidad} · esperan {e.total}
                </span>
                {alcance === "no_alcanza" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--warn)]">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    no alcanza para todos
                  </span>
                ) : null}
              </div>

              <ul className="mt-1 flex flex-col gap-1">
                {e.pedidos.map((p) => (
                  <li
                    key={`${p.cotizacion_id}-${l.producto_id}`}
                    className="flex flex-wrap items-center gap-x-2 text-sm"
                  >
                    <Link
                      href={`/cotizaciones/${p.cotizacion_id}`}
                      className="font-mono text-[0.8rem] text-brand-600 hover:underline"
                    >
                      {p.cotizacion}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
                    <span className="tabular text-sm">{p.esperando}</span>
                    <Badge
                      tone={
                        p.urgencia === "vencido"
                          ? "danger"
                          : p.urgencia === "hoy"
                            ? "warning"
                            : "neutral"
                      }
                      size="xs"
                    >
                      {/* La fecha además de la etiqueta: «vencido» dice que hay
                          un problema, y el día dice de qué tamaño es. */}
                      {ETIQUETA_URGENCIA[p.urgencia]} · {formatearFecha(p.prometida)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
