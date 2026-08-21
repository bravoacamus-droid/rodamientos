import Link from "next/link";
import { Moneda } from "@rodatech/ui";

import { cartera } from "../api/consultas";

/**
 * Aging de cartera en los cuatro tramos que usa el cliente.
 *
 * Las barras son proporcionales al total: el tamaño relativo se lee de un
 * vistazo, que es lo que interesa antes que la cifra exacta.
 */
export async function PanelCartera() {
  const resultado = await cartera();
  const c = resultado.ok
    ? resultado.datos
    : {
        porVencer: 0,
        vencido1a15: 0,
        vencido16a30: 0,
        vencido31a60: 0,
        vencidoMas60: 0,
        total: 0,
      };

  const tramos = [
    { etiqueta: "Por vencer", valor: c.porVencer, color: "var(--ok)" },
    { etiqueta: "1 – 15 días", valor: c.vencido1a15, color: "var(--warn)" },
    { etiqueta: "16 – 30 días", valor: c.vencido16a30, color: "#E07A1F" },
    { etiqueta: "31 – 60 días", valor: c.vencido31a60, color: "var(--danger)" },
    { etiqueta: "Más de 60", valor: c.vencidoMas60, color: "#7A1D18" },
  ];

  const vencido = c.total - c.porVencer;

  return (
    <section className="card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3">
        <h2 className="text-sm font-semibold">Cartera</h2>
        <Link href="/cobranzas" className="text-xs text-brand-600 hover:underline">
          Ver cobranzas
        </Link>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--fg-subtle)]">Por cobrar</p>
            <Moneda valor={c.total} tamano="xl" enfasis="fuerte" />
          </div>
          {vencido > 0 ? (
            <div className="text-right">
              <p className="text-xs text-[var(--fg-subtle)]">Vencido</p>
              <Moneda valor={vencido} tamano="md" resaltarNegativo={false} />
            </div>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {tramos.map((t) => {
            const pct = c.total > 0 ? (t.valor / c.total) * 100 : 0;
            return (
              <li key={t.etiqueta} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-[var(--fg-muted)]">{t.etiqueta}</span>
                  <Moneda valor={t.valor} tamano="xs" enfasis="suave" />
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: t.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
