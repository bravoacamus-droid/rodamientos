"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@rodatech/ui";

import { ponerMoneda } from "../../acciones/gestionar";

/**
 * Dólares o soles, en la ficha (116).
 *
 * Luis, 14/10: *«algunos cobros, rara vez, se pagan en soles; si lo
 * convertimos a soles y se hace la guía, el cobro tiene que ser en soles»*.
 * Se elige mientras la cotización es borrador o enviada; al aprobarla se
 * congela el tipo de cambio y ya no se cambia.
 */
export function MonedaVenta({ id, moneda }: { id: string; moneda: "USD" | "PEN" }) {
  const router = useRouter();
  const [pendiente, iniciar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const elegir = (m: "USD" | "PEN") => {
    if (m === moneda) return;
    setError(null);
    iniciar(async () => {
      const r = await ponerMoneda(id, m);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  // El mismo grupo que «Moneda del papel»: la misma idea, el mismo aspecto.
  const boton = (activo: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors disabled:opacity-60",
      activo
        ? "bg-[var(--surface)] font-semibold text-brand-700 elev-1 dark:text-brand-300"
        : "font-medium text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]",
    );

  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="Moneda de la venta"
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1"
      >
        <button type="button" aria-pressed={moneda === "USD"} className={boton(moneda === "USD")} disabled={pendiente} onClick={() => elegir("USD")}>
          Dólares ($)
        </button>
        <button type="button" aria-pressed={moneda === "PEN"} className={boton(moneda === "PEN")} disabled={pendiente} onClick={() => elegir("PEN")}>
          Soles (S/)
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
