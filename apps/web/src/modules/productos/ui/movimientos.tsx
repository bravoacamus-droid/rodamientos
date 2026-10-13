import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, History, SlidersHorizontal } from "lucide-react";

import { enlaceDeReferencia, type FilaKardex, type TipoMovimiento } from "@/modules/inventario";

/**
 * Lo que movió el stock de este producto, en su ficha (13/10).
 *
 * Willy lo pidió en la reunión del 06/10: el kardex ya existía, y lo que él
 * quería era verlo **desde el producto** — *qué ajuste, qué motivo, qué día*.
 * Hasta hoy solo se llegaba por «⋮ → Ver kardex» en la lista del catálogo, y
 * desde la ficha no había camino: la cifra del stock salía sola, sin decir de
 * dónde venía.
 *
 * Dicho en palabras y no con los nombres del kardex: «Ajuste +» es jerga de
 * libro contable; «Ajuste: se sumaron 3» se lee sin que nadie lo explique.
 */

const QUE_PASO: Record<TipoMovimiento, { texto: (n: string) => string; icono: typeof History; color: string }> = {
  ingreso: { texto: (n) => `Entraron ${n}`, icono: ArrowDownToLine, color: "text-[var(--ok)]" },
  salida: { texto: (n) => `Salieron ${n}`, icono: ArrowUpFromLine, color: "text-[var(--info)]" },
  ajuste_positivo: { texto: (n) => `Ajuste: se sumaron ${n}`, icono: SlidersHorizontal, color: "text-[var(--warn)]" },
  ajuste_negativo: { texto: (n) => `Ajuste: se restaron ${n}`, icono: SlidersHorizontal, color: "text-[var(--warn)]" },
};

/** Cómo se llama, para quien lo lee, el documento que lo movió. */
const DOCUMENTO: Record<string, string> = {
  recepcion: "Recepción",
  guia: "Guía",
  comprobante: "Factura",
  ajuste: "Ajuste",
  importacion: "Carga inicial",
};

/**
 * Día y hora EN LIMA. Cortar el ISO a 10 caracteres daba el día de UTC: lo
 * que se recibe a las 8 de la noche salía con fecha de mañana.
 */
const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Los motivos que pone la base sola y que solo repiten el documento. Los
 * demás se enseñan: el de un ajuste lo escribió quien lo hizo, y «Reposición
 * por anulación de guía» explica una entrada que si no parecería una compra.
 */
const MOTIVO_QUE_REPITE = new Set(["Recepción de mercadería", "Despacho con guía de remisión"]);

const cantidad = (n: number, unidad: string) => `${Number(n).toLocaleString("es-PE")} ${unidad}`;

export function MovimientosDelProducto({
  productoId,
  filas,
  hayMas,
  unidad,
  error,
}: {
  productoId: string;
  filas: FilaKardex[];
  hayMas: boolean;
  /** «und», ya legible. */
  unidad: string;
  error?: string | null;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <History className="size-5 text-[var(--fg-muted)]" aria-hidden="true" />
          Movimientos del stock
        </h2>
        {filas.length > 0 ? (
          <Link
            href={`/inventario/kardex?producto=${productoId}`}
            className="inline-flex h-control-md items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            {hayMas ? "Ver todos en el kardex" : "Abrir en el kardex"}
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]">No se pudieron cargar los movimientos: {error}</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Todavía no ha entrado ni salido nada de este producto. Se anota solo al recibir
          mercadería, al sacar una guía o al hacer un ajuste de inventario.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
          {filas.map((m) => {
            const q = QUE_PASO[m.tipo];
            const Icono = q.icono;
            const n = cantidad(m.entrada > 0 ? m.entrada : m.salida, unidad);
            const enlace = enlaceDeReferencia(m.referencia_tipo, m.referencia_id);
            const doc = m.referencia_tipo ? (DOCUMENTO[m.referencia_tipo] ?? "Documento") : null;
            const motivo = m.motivo && !MOTIVO_QUE_REPITE.has(m.motivo) ? m.motivo : null;
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
                <Icono className={`mt-0.5 size-5 shrink-0 ${q.color}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">
                    {q.texto(n)}
                    {m.tipo === "ingreso" && Number(m.costo_unitario) > 0 ? (
                      <span className="font-normal text-[var(--fg-muted)]">
                        {" "}
                        a $ {Number(m.costo_unitario).toFixed(2)} c/u
                      </span>
                    ) : null}
                  </p>
                  {/* El motivo: es lo que Willy pidió ver de un ajuste. */}
                  {motivo ? (
                    <p className="text-sm">
                      <span className="text-[var(--fg-muted)]">Motivo:</span> {motivo}
                    </p>
                  ) : null}
                  <p className="text-sm text-[var(--fg-muted)]">
                    {cuando(m.fecha)}
                    {doc ? (
                      <>
                        {" · "}
                        {doc}{" "}
                        {m.referencia_numero ? (
                          enlace ? (
                            <Link href={enlace} className="font-mono font-medium text-brand-600 hover:underline">
                              {m.referencia_numero}
                            </Link>
                          ) : (
                            <span className="font-mono">{m.referencia_numero}</span>
                          )
                        ) : null}
                      </>
                    ) : null}
                    {m.usuario ? ` · ${m.usuario}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm text-[var(--fg-muted)]">
                  Quedaron
                  <span className="block text-base font-semibold tabular text-[var(--fg)]">
                    {cantidad(m.saldo_cantidad, unidad)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
