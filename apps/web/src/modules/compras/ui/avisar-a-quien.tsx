import Link from "next/link";
import { Badge, formatearFecha } from "@rodatech/ui";

import { listosParaEntregar } from "../api/por-comprar";
import { ETIQUETA_URGENCIA } from "../dominio/por-comprar";

/**
 * «Acabas de recibir esto: avisa a estos.»
 *
 * Va al pie de la recepción guardada porque ese es el momento exacto en que
 * hay que acordarse. La mercadería acaba de entrar, está delante, y el cliente
 * que la lleva esperando semanas es justo el que se olvida.
 *
 * ---------------------------------------------------------------------------
 * Por qué no basta con la pantalla de «Listos para entregar»
 * ---------------------------------------------------------------------------
 * Porque hay que acordarse de abrirla. Un aviso puesto donde ya estás mirando
 * no depende de que nadie se acuerde de nada — y la pantalla sigue estando
 * para cuando se cierra esta y hay que volver al asunto mañana.
 *
 * Se enseñan los cinco que más aprietan: es un recordatorio, no un informe.
 *
 * ---------------------------------------------------------------------------
 * No se filtra por los productos de ESTA recepción, y es a propósito
 * ---------------------------------------------------------------------------
 * Podría parecer más preciso enseñar solo lo que esta caja destraba, pero un
 * pedido puede quedar listo por la suma de dos entradas distintas, y ese
 * —justamente— es el que nadie recuerda. Enseñar todo lo entregable responde
 * la pregunta que se hace de verdad: «ya que estoy en el almacén, ¿a quién
 * puedo despachar?».
 */
export async function AvisarAQuien() {
  const r = await listosParaEntregar();
  if (!r.ok || r.datos.length === 0) return null;

  const primeros = r.datos.slice(0, 5);

  return (
    <section className="card p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">A quién se le puede entregar ya</h2>
        <Link
          href="/cotizaciones/listos"
          className="text-xs text-brand-600 underline-offset-2 hover:underline"
        >
          Verlos todos
        </Link>
      </div>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        Con lo que hay hoy en almacén. Es el momento de avisarles.
      </p>

      <ul className="flex flex-col gap-1.5">
        {primeros.map((p) => (
          <li key={p.cotizacion_id} className="flex flex-wrap items-center gap-x-2 text-sm">
            <Link
              href={`/cotizaciones/${p.cotizacion_id}`}
              className="font-mono text-[0.8rem] text-brand-600 hover:underline"
            >
              {p.cotizacion}
            </Link>
            <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
            <span className="tabular text-sm">
              {p.estado === "completo" ? p.unidades : `${p.unidades} de ${p.pendientes}`}
            </span>
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
              {p.estado === "completo"
                ? "completo"
                : ETIQUETA_URGENCIA[p.urgencia]}
            </Badge>
            <span className="text-xs text-[var(--fg-subtle)]">
              {formatearFecha(p.prometida)}
            </span>
          </li>
        ))}
      </ul>

      {r.datos.length > primeros.length ? (
        <p className="mt-2 text-xs text-[var(--fg-subtle)]">
          y {r.datos.length - primeros.length} más.
        </p>
      ) : null}
    </section>
  );
}
