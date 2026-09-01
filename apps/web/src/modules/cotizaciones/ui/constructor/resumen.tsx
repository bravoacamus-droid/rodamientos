"use client";

import { Switch } from "@rodatech/ui";

import type { Bloqueo } from "../../dominio/constructor";
import type { TotalesCotizacion } from "../../dominio/totales";

/**
 * Totales y opciones del documento.
 *
 * C6 (14:54): la moneda es SIEMPRE dólares, así que no hay selector.
 * C5 (15:52): el descuento es una casilla habilitable.
 */

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

export function ResumenConstructor({
  totales,
  bloqueos,
  mostrarDescuento,
  onMostrarDescuento,
  mostrarDisponibilidad,
  onMostrarDisponibilidad,
  hayNoInmediatos,
  guardando,
}: {
  totales: TotalesCotizacion;
  bloqueos: Bloqueo[];
  mostrarDescuento: boolean;
  onMostrarDescuento: (v: boolean) => void;
  mostrarDisponibilidad: boolean;
  onMostrarDisponibilidad: (v: boolean) => void;
  /** Si alguna línea no es inmediata. Decide si vale la pena imprimir. */
  hayNoInmediatos: boolean;
  guardando: boolean;
}) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-80">
      <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Totales</h2>

        <dl className="flex flex-col gap-1.5 text-sm">
          <Fila etiqueta="Valor de venta" valor={dolar(totales.subtotal)} />
          {totales.descuentoTotal > 0 ? (
            <Fila
              etiqueta="Descuento"
              valor={`− ${dolar(totales.descuentoTotal)}`}
              tono="ok"
            />
          ) : null}
          <Fila etiqueta="IGV (18%)" valor={dolar(totales.igv)} />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila etiqueta="Total" valor={dolar(totales.total)} destacado />
        </dl>

        {/* El margen es información interna: nunca sale en el PDF del cliente. */}
        {totales.costoTotal > 0 ? (
          <div className="mt-3 rounded-sm bg-[var(--surface-2)] p-2.5">
            <div className="flex items-baseline justify-between">
              {/* Se dice «sobre el costo» aquí, y solo aquí, porque es la
                  pantalla donde se negocia: leer un 20 % como si fuera sobre
                  la venta cambia lo que el vendedor está dispuesto a ceder. */}
              <span className="text-xs text-[var(--fg-muted)]">Margen s/ costo</span>
              <span
                className={`tabular text-sm font-semibold ${
                  totales.margenPct < 12
                    ? "text-[var(--danger)]"
                    : totales.margenPct < 20
                      ? "text-[var(--warn)]"
                      : "text-[var(--ok)]"
                }`}
              >
                {totales.margenPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-xs text-[var(--fg-muted)]">
                {dolar(totales.subtotal - totales.costoTotal)}
              </span>
              <span className="text-xs text-[var(--fg-muted)]">
                costo {dolar(totales.costoTotal)}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">El documento</h2>

        <label className="flex items-start justify-between gap-3">
          <span className="text-sm">
            Mostrar columna de descuento
            <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">
              Solo si de verdad hay algo que descontar.
            </span>
          </span>
          <Switch
            checked={mostrarDescuento}
            onCheckedChange={onMostrarDescuento}
            aria-label="Mostrar columna de descuento"
          />
        </label>

        {/*
          Willy, 01/09 (8:38): *«esa columna se puede incluir o no según el
          caso, porque rara vez es importación; por lo general todo es de
          entrada inmediata»*. Mismo trato que el descuento.

          La ayuda cambia según lo que haya en la cotización porque la
          decisión también cambia: con todo inmediato la columna diría lo
          mismo seis veces, y ahí sí molesta.
        */}
        <label className="mt-3 flex items-start justify-between gap-3 border-t border-[var(--border)] pt-3">
          <span className="text-sm">
            Mostrar columna de entrega
            <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">
              {hayNoInmediatos
                ? "Hay ítems que no son inmediatos: conviene que el cliente lo vea."
                : "Todo es inmediato, así que diría lo mismo en cada línea."}
            </span>
          </span>
          <Switch
            checked={mostrarDisponibilidad}
            onCheckedChange={onMostrarDisponibilidad}
            aria-label="Mostrar columna de entrega"
          />
        </label>

        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--fg-muted)]">
          El PDF lleva <strong>valor unitario</strong>, nunca el precio con IGV:
          es la columna que hacía que el cliente comparara mal contra la
          competencia. La moneda es siempre el dólar.
        </p>
      </section>

      {bloqueos.length > 0 ? (
        <section className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
          <p className="text-sm font-medium">Falta para poder guardar</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {bloqueos.map((b) => (
              <li key={b.campo}>{b.mensaje}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {guardando ? (
        <p className="text-sm text-[var(--fg-muted)]">Guardando…</p>
      ) : null}
    </aside>
  );
}

function Fila({
  etiqueta,
  valor,
  destacado = false,
  tono,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  tono?: "ok";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={destacado ? "font-semibold" : "text-[var(--fg-muted)]"}>
        {etiqueta}
      </dt>
      <dd
        className={`tabular ${destacado ? "text-lg font-semibold" : ""} ${
          tono === "ok" ? "text-[var(--ok)]" : ""
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
