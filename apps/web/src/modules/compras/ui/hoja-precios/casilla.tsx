"use client";

import * as React from "react";
import { campoBase, cn } from "@rodatech/ui";
import { Check, Trophy, Undo2, X } from "lucide-react";

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

  /*
    EL MEJOR PRECIO, DE UN VISTAZO (27/11). Antes solo lo decía un fondo
    verde claro y la palabra «Mejor» en 14 px al pie, que con poca vista o en
    contraste alto (donde el fondo de estado pasa a blanco) no se distinguía.
    Ahora son tres señales a la vez, y ninguna depende solo del color:
      · una cinta arriba con trofeo y la palabra «Mejor precio»;
      · el borde grueso de 3 px alrededor;
      · el precio en negrita y más grande.
    Si a quien se le compra no es el más barato (elegido a mano), la cinta
    dice «Le compras aquí» y el más barato conserva su marca, con borde de
    rayas: que se vea que se está pagando más a propósito.
  */
  const conPrecio = casilla.precio !== null;
  const cinta = conPrecio && elegido ? (mejor ? "mejor" : "elegido") : conPrecio && mejor && hayVarios ? "barato" : null;

  return (
    <div
      className={cn(
        "flex min-h-[5.5rem] flex-col gap-1.5 rounded-lg p-1.5",
        cinta === "mejor" && "border-[3px] border-[var(--ok)] bg-[var(--ok-bg)]",
        cinta === "elegido" && "border-[3px] border-[var(--info)] bg-[var(--info-bg)]",
        cinta === "barato" && "border-[3px] border-dashed border-[var(--ok)]",
      )}
    >
      {cinta === "mejor" ? (
        <span className="-mx-1.5 -mt-1.5 flex items-center justify-center gap-1.5 rounded-t-[0.3rem] bg-[var(--ok)] px-2 py-1 text-sm font-bold text-[var(--fg-inverso)]">
          <Trophy className="size-4" aria-hidden="true" />
          Mejor precio
        </span>
      ) : cinta === "elegido" ? (
        <span className="-mx-1.5 -mt-1.5 flex items-center justify-center gap-1.5 rounded-t-[0.3rem] bg-[var(--info)] px-2 py-1 text-sm font-bold text-[var(--fg-inverso)]">
          <Check className="size-4" aria-hidden="true" />
          Le compras aquí
        </span>
      ) : cinta === "barato" ? (
        <span className="flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--ok)]">
          <Trophy className="size-4" aria-hidden="true" />
          El más barato
        </span>
      ) : null}
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
          className={cn(
            campoBase,
            "h-10 pl-8 pr-2 text-right text-base tabular",
            cinta === "mejor" && "text-lg font-extrabold",
            cinta === "elegido" && "font-bold",
          )}
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
                gana {(margen * 100).toFixed(2)} %
              </span>
            ) : (
              <span className="text-sm text-[var(--fg-subtle)]">sin P.V.</span>
            )}
            {elegido ? null : hayVarios && !soloLectura ? (
              <button
                type="button"
                onClick={onElegir}
                className="inline-flex h-8 items-center rounded-md border border-[var(--boton-fila-borde)] bg-[var(--boton-fila-bg)] px-2 text-sm font-semibold text-[var(--boton-fila-fg)] hover:border-[var(--boton-fila-borde-hover)] hover:bg-[var(--boton-fila-bg-hover)]"
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
