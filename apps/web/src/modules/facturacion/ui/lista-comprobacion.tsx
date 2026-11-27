import { CircleCheck, CircleX, Info } from "lucide-react";
import { cn } from "@rodatech/ui";

/**
 * «¿Puedo emitir ya?», contestado como una lista de comprobación (27/11).
 *
 * Los bloqueos ya se enseñaban, pero repartidos en tres cajas de colores
 * distintos —ámbar para la guía, ámbar para las cantidades, rojo para SUNAT—
 * y solo cuando algo fallaba: lo que estaba bien no se decía. Para saber si
 * se podía emitir había que leer las tres y deducir que no faltaba nada.
 *
 * Aquí cada requisito tiene su renglón, con su palabra además del color —
 * «Listo» en verde con visto, «Falta» en rojo con aspa— porque Willy no
 * distingue bien los tonos. Y arriba, una sola frase con lo que importa:
 * «Todo listo» o «Falta 1 cosa».
 *
 * NO decide nada: recibe lo que ya calculó `bloqueosEmision`, que es quien
 * manda (y detrás la Server Action y `emitir_comprobante`). Esto solo lo
 * ordena para que se lea.
 */
export interface Requisito {
  clave: string;
  titulo: string;
  /** `null` cuando está listo; el porqué cuando falta. */
  falta: string | null;
  /** Lo que se dice cuando está listo, si hay algo que decir. */
  detalleListo?: string;
}

export function ListaComprobacion({
  requisitos,
  aviso,
}: {
  requisitos: Requisito[];
  /** Una nota que no bloquea (cómo se manda a SUNAT). */
  aviso?: React.ReactNode;
}) {
  const faltan = requisitos.filter((r) => r.falta !== null).length;

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-l-4 p-3",
          faltan === 0
            ? "border-[var(--ok)] bg-[var(--ok-bg)]"
            : "border-[var(--danger)] bg-[var(--danger-bg)]",
        )}
      >
        {faltan === 0 ? (
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-[var(--ok)]" aria-hidden="true" />
        ) : (
          <CircleX className="mt-0.5 size-6 shrink-0 text-[var(--danger)]" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className={cn("text-lg font-bold", faltan === 0 ? "text-[var(--ok)]" : "text-[var(--danger)]")}>
            {faltan === 0 ? "Todo listo para emitir" : `Falta ${faltan} ${faltan === 1 ? "cosa" : "cosas"} para emitir`}
          </p>
          <p className="text-base text-[var(--fg)]">
            {faltan === 0
              ? "Mira la vista previa y emite desde ahí."
              : "Lo que está en rojo hay que resolverlo antes."}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {requisitos.map((r) => {
          const listo = r.falta === null;
          return (
            <li
              key={r.clave}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                listo ? "border-[var(--border)] bg-[var(--surface)]" : "border-[var(--danger)] bg-[var(--danger-bg)]",
              )}
            >
              {listo ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-base font-semibold">{r.titulo}</span>
                  <span
                    className={cn(
                      "text-sm font-bold uppercase tracking-wide",
                      listo ? "text-[var(--ok)]" : "text-[var(--danger)]",
                    )}
                  >
                    {listo ? "Listo" : "Falta"}
                  </span>
                </p>
                {listo ? (
                  r.detalleListo ? <p className="text-sm text-[var(--fg-muted)]">{r.detalleListo}</p> : null
                ) : (
                  <p className="text-sm text-[var(--fg)]">{r.falta}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {aviso ? (
        <p className="flex items-start gap-2 text-sm text-[var(--fg-muted)]">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--info)]" aria-hidden="true" />
          <span>{aviso}</span>
        </p>
      ) : null}
    </div>
  );
}
