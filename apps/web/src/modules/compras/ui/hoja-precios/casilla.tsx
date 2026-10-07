"use client";

import * as React from "react";
import { Check, Undo2, X } from "lucide-react";

import type { Casilla } from "../../dominio/hoja-precios";

/**
 * Una casilla de la hoja: lo que dijo UN proveedor de UN producto.
 *
 * Tres estados, y los tres se ven distintos:
 *   · vacía — todavía no se sabe. Una caja para escribir el precio.
 *   · con precio — la caja con el número; si es el más barato, en verde.
 *   · «no tiene» — gris, tachada, con «Deshacer». No compite.
 *
 * El texto de la caja se lleva aparte del número: así se puede escribir
 * «12.» sin que se convierta en «12» a mitad de teclear.
 */
export function CasillaPrecio({
  casilla,
  simbolo,
  codigo,
  proveedor,
  mejor,
  elegido,
  hayVarios,
  margen,
  soloLectura,
  onPrecio,
  onNoTiene,
  onElegir,
}: {
  casilla: Casilla;
  simbolo: string;
  codigo: string;
  proveedor: string;
  /** Es el precio más bajo de la fila. */
  mejor: boolean;
  /** A este se le compra (el más barato, o el elegido a mano). */
  elegido: boolean;
  /** Hay más de una oferta en la fila: tiene sentido «Comprar aquí». */
  hayVarios: boolean;
  margen: number | null;
  soloLectura: boolean;
  onPrecio: (precio: number | null) => void;
  onNoTiene: (noTiene: boolean) => void;
  onElegir: () => void;
}) {
  const [texto, setTexto] = React.useState(casilla.precio === null ? "" : String(casilla.precio));
  const [editando, setEditando] = React.useState(false);

  // Si el precio cambia desde fuera (traer un análisis, deshacer), la caja lo
  // refleja; mientras se escribe, manda lo tecleado.
  React.useEffect(() => {
    if (!editando) setTexto(casilla.precio === null ? "" : String(casilla.precio));
  }, [casilla.precio, editando]);

  if (casilla.noTiene) {
    return (
      <div className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-2 text-center">
        <span className="text-sm font-semibold text-[var(--fg-muted)] line-through decoration-2">No tiene</span>
        {soloLectura ? null : (
          <button
            type="button"
            onClick={() => onNoTiene(false)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm font-medium hover:bg-[var(--surface-3)]"
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Deshacer
          </button>
        )}
      </div>
    );
  }

  const tono =
    margen === null ? "" : margen < 0 ? "text-[var(--danger)]" : margen < 0.15 ? "text-[var(--warn)]" : "text-[var(--ok)]";

  return (
    <div
      className={`flex min-h-[5.5rem] flex-col gap-1.5 rounded-md p-1.5 ${
        elegido && casilla.precio !== null ? "bg-[var(--ok-bg)] ring-2 ring-[var(--ok)]" : ""
      }`}
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--fg-subtle)]">
          {simbolo}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          disabled={soloLectura}
          aria-label={`Precio de ${codigo} con ${proveedor}`}
          placeholder="Precio"
          onFocus={() => setEditando(true)}
          onBlur={() => setEditando(false)}
          onChange={(e) => {
            const limpio = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
            setTexto(limpio);
            const n = Number(limpio);
            onPrecio(limpio === "" || !Number.isFinite(n) ? null : n);
          }}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-8 pr-2 text-right text-base tabular focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:bg-[var(--surface-2)]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1">
        {casilla.precio === null ? (
          soloLectura ? null : (
            <button
              type="button"
              onClick={() => onNoTiene(true)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              <X className="size-4" aria-hidden="true" />
              No tiene
            </button>
          )
        ) : (
          <>
            {margen !== null ? (
              <span className={`text-sm font-semibold tabular ${tono}`} title="Margen sobre el costo contra tu precio de venta">
                gana {Math.round(margen * 100)} %
              </span>
            ) : (
              <span className="text-sm text-[var(--fg-subtle)]">sin P.V.</span>
            )}
            {elegido ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ok)]">
                <Check className="size-4" aria-hidden="true" />
                {mejor ? "Mejor" : "Elegido"}
              </span>
            ) : hayVarios && !soloLectura ? (
              <button
                type="button"
                onClick={onElegir}
                className="inline-flex h-8 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                Comprar aquí
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
