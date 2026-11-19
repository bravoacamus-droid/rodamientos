import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { buttonVariants, cn } from "@rodatech/ui";

import { TANDA, TOPE_VER_MAS, conCuantos } from "@/lib/ver-mas";

/**
 * El pie de una lista que crece: cuántas hay a la vista y el botón para ver
 * las siguientes (ver `lib/ver-mas.ts`).
 *
 * Un enlace y no un botón con estado: la lista se sirve entera desde el
 * servidor con el `n` nuevo, y `scroll={false}` deja la vista donde estaba,
 * así que las filas nuevas aparecen debajo de la última que se leyó.
 */
export function VerMas({
  query,
  cuantos,
  enPantalla,
  hayMas,
  total,
  nombre = ["movimiento", "movimientos"],
  tanda = TANDA,
}: {
  /** Los filtros de la pantalla, sin `?`. */
  query: string;
  /** El `n` con el que se pidió la lista. */
  cuantos: number;
  /** Las filas que llegaron. */
  enPantalla: number;
  hayMas: boolean;
  /** Si se sabe, cuántas hay en total con estos filtros. */
  total?: number | null;
  /** Cómo se llama lo que se lista, en singular y en plural. */
  nombre?: [string, string];
  /** De a cuántas crece; tiene que ser la misma con la que se leyó `n`. */
  tanda?: number;
}) {
  const quedan = total != null ? Math.max(total - enPantalla, 0) : null;
  const tope = Math.floor(TOPE_VER_MAS / tanda) * tanda;
  const siguiente = Math.min(cuantos + tanda, tope);
  const alTope = hayMas && cuantos >= tope;

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
      <p className="text-sm text-[var(--fg-muted)]" role="status">
        Mostrando <span className="font-semibold tabular text-[var(--fg)]">{enPantalla.toLocaleString("es-PE")}</span>
        {total != null ? (
          <>
            {" "}de <span className="font-semibold tabular text-[var(--fg)]">{total.toLocaleString("es-PE")}</span>
          </>
        ) : null}{" "}
        {(total ?? enPantalla) === 1 ? nombre[0] : nombre[1]}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {hayMas && !alTope ? (
          <Link
            href={conCuantos(query, siguiente, tanda)}
            scroll={false}
            className={cn(buttonVariants({ variant: "primary" }), "h-11 gap-2 px-5 text-base")}
          >
            <ArrowDownToLine className="size-5" aria-hidden="true" />
            Ver {Math.min(tanda, quedan ?? tanda)} más
            {quedan != null ? <span className="font-normal opacity-85">(quedan {quedan.toLocaleString("es-PE")})</span> : null}
          </Link>
        ) : null}
        {cuantos > tanda && enPantalla > tanda ? (
          <Link href={conCuantos(query, tanda, tanda)} className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}>
            <ArrowUpToLine className="size-4" aria-hidden="true" />
            Volver a las primeras {tanda}
          </Link>
        ) : null}
      </div>
      {alTope ? (
        <p className="text-sm text-[var(--fg-muted)]">
          Para ver más de {tope.toLocaleString("es-PE")}, filtra o descarga el Excel.
        </p>
      ) : null}
    </div>
  );
}
