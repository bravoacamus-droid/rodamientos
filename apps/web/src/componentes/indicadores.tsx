import Link from "next/link";
import { EstadoError } from "@rodatech/ui";

/**
 * La fila de cifras de arriba de una lista de ventas (07/10).
 *
 * Cuatro tarjetas como mucho, cada una con su número grande, una línea de qué
 * es y —si lleva a algún sitio— el aspecto de botón. El color de la cifra
 * dice algo (verde: va bien, ámbar: mírame, rojo: urge), nunca decora: sin
 * tono, va en el color del texto.
 *
 * Sin «use client» y sin recharts: son cifras, se pintan en el servidor.
 */

export interface Indicador {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "ok" | "aviso" | "urgente";
  icono?: React.ReactNode;
  /** Si la tarjeta lleva a la lista ya filtrada. */
  href?: string;
}

const COLOR: Record<NonNullable<Indicador["tono"]>, string> = {
  ok: "text-[var(--ok)]",
  aviso: "text-[var(--warn)]",
  urgente: "text-[var(--danger)]",
};

export function FilaIndicadores({ items }: { items: Indicador[] }) {
  return (
    <div className="@container">
      {/* De dos en dos ya en el teléfono: una por fila eran 600 px de
          tarjetas antes de la primera línea de la lista (07/10). */}
      <div className="grid grid-cols-2 gap-2 @md:gap-3 @4xl:grid-cols-4">
        {items.map((i) => {
          const cuerpo = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                  {i.etiqueta}
                </p>
                {i.icono ? (
                  <span className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--fg-muted)] @md:flex [&_svg]:size-[18px]">
                    {i.icono}
                  </span>
                ) : null}
              </div>
              <p className={`tabular mt-1 text-xl font-semibold leading-tight @md:text-2xl ${i.tono ? COLOR[i.tono] : ""}`}>
                {i.valor}
              </p>
              {i.detalle ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{i.detalle}</p> : null}
            </>
          );
          return i.href ? (
            <Link
              key={i.etiqueta}
              href={i.href}
              className="card elev-1 block p-3 @md:p-4 transition-[box-shadow,border-color] hover:elev-2 hover:border-brand-300"
            >
              {cuerpo}
            </Link>
          ) : (
            <div key={i.etiqueta} className="card elev-1 p-3 @md:p-4">
              {cuerpo}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Si las cifras no cargan, la lista sigue: se dice en una línea y ya. */
export function IndicadoresError({ detalle }: { detalle: string }) {
  return <EstadoError titulo="No se pudieron cargar las cifras" detalle={detalle} />;
}

/** Cómo se dice el periodo en el detalle de una tarjeta. */
export function textoPeriodo(desde?: string, hasta?: string): string {
  const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  if (desde && hasta) return `del ${f(desde)} al ${f(hasta)}`;
  if (desde) return `desde el ${f(desde)}`;
  if (hasta) return `hasta el ${f(hasta)}`;
  return "en todo el histórico";
}
