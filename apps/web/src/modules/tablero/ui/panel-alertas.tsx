import Link from "next/link";
import { EstadoVacio } from "@rodatech/ui";

import { alertasPrioritarias, alertasSinNotificar } from "../api/consultas";

const COLOR_SEVERIDAD: Record<string, string> = {
  critica: "bg-[var(--danger-bg)] text-[var(--danger)]",
  alta: "bg-[var(--warn-bg)] text-[var(--warn)]",
  media: "bg-[var(--info-bg)] text-[var(--info)]",
  baja: "bg-[var(--surface-2)] text-[var(--fg-muted)]",
};

const ETIQUETA_SEVERIDAD: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * Alertas prioritarias.
 *
 * El cliente fue explícito: «pero no te llega como una alerta, tú tienes que
 * entrar y ver» (25:21). Por eso se muestra cuántas están **sin notificar**:
 * es el indicador de que el envío está funcionando o no. Mientras no exista el
 * worker que las empuja, ese contador dice la verdad en vez de disimularla.
 */
export async function PanelAlertas() {
  const [lista, pendientes] = await Promise.all([
    alertasPrioritarias(6),
    alertasSinNotificar(),
  ]);

  const alertas = lista.ok ? lista.datos : [];
  const sinNotificar = pendientes.ok ? pendientes.datos : 0;

  return (
    <section className="card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3">
        <h2 className="text-sm font-semibold">Alertas</h2>
        <div className="flex items-center gap-2">
          {sinNotificar > 0 ? (
            <span
              className="rounded-sm bg-[var(--warn-bg)] px-1.5 py-0.5 text-[0.68rem] font-medium text-[var(--warn)]"
              title="Generadas pero todavía no enviadas a nadie"
            >
              {sinNotificar} sin avisar
            </span>
          ) : null}
          <Link
            href="/alertas"
            className="text-xs text-brand-600 hover:underline"
          >
            Ver todas
          </Link>
        </div>
      </header>

      {alertas.length === 0 ? (
        <div className="p-4">
          <EstadoVacio
            titulo="Sin alertas"
            descripcion="No hay nada que requiera atención ahora mismo."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {alertas.map((a) => {
            const contenido = (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium ${
                    COLOR_SEVERIDAD[a.severidad] ?? COLOR_SEVERIDAD.baja
                  }`}
                >
                  {ETIQUETA_SEVERIDAD[a.severidad] ?? a.severidad}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.titulo}</p>
                  <p className="truncate text-xs text-[var(--fg-muted)]">
                    {a.mensaje}
                  </p>
                </div>
                {a.notificado_en === null ? (
                  <span
                    aria-label="Sin notificar"
                    title="Sin notificar"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--warn)]"
                  />
                ) : null}
              </div>
            );

            return (
              <li key={a.id}>
                {a.accion_url ? (
                  <Link
                    href={a.accion_url}
                    className="block transition-colors hover:bg-[var(--surface-2)]"
                  >
                    {contenido}
                  </Link>
                ) : (
                  contenido
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
