import type { LucideIcon } from "lucide-react";
import { cn } from "@rodatech/ui";

/**
 * Las piezas de una FICHA de catálogo y almacén (27/11).
 *
 * Luis, 27/11: los supervisores encontraban el sistema «muy básico, muy
 * plano, neutral, simple». Las fichas eran tarjetas blancas iguales, con el
 * título en `text-base` y las cifras en `text-lg`: todo pesaba lo mismo, así
 * que nada destacaba. Estas tres piezas ponen la jerarquía del tablero —cifra
 * grande, icono en su chip, filo de color con SIGNIFICADO— sin tocar el
 * sistema de diseño compartido: viven aquí y las usan producto, kit, kardex y
 * equivalencias, para que las cuatro pantallas se parezcan entre sí.
 *
 * Server Components: son clases, no hay estado.
 */

/** Qué significa el color. Nunca se elige por bonito. */
export type TonoFicha = "ok" | "aviso" | "malo" | "info" | "marca" | "neutro";

const FILO: Record<TonoFicha, string> = {
  ok: "border-l-[var(--ok)]",
  aviso: "border-l-[var(--warn)]",
  malo: "border-l-[var(--danger)]",
  info: "border-l-[var(--info)]",
  marca: "border-l-brand-500",
  neutro: "border-l-[var(--border-strong)]",
};

const CHIP: Record<TonoFicha, string> = {
  ok: "bg-ok-bg text-ok ring-[var(--ok)]/20",
  aviso: "bg-warn-bg text-warn ring-[var(--warn)]/25",
  malo: "bg-danger-bg text-danger ring-[var(--danger)]/25",
  info: "bg-info-bg text-info ring-[var(--info)]/20",
  marca:
    "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-surface-3 dark:text-brand-300 dark:ring-[var(--border)]",
  neutro: "bg-surface-2 text-muted ring-[var(--border)]",
};

const TEXTO: Record<TonoFicha, string> = {
  ok: "text-[var(--ok)]",
  aviso: "text-[var(--warn)]",
  malo: "text-[var(--danger)]",
  info: "text-[var(--info)]",
  marca: "text-[var(--titulo)]",
  neutro: "text-[var(--titulo)]",
};

/** El icono en su caja: suelto y en gris se leía como decoración. */
export function ChipIcono({
  icono: Icono,
  tono = "marca",
  grande = false,
}: {
  icono: LucideIcon;
  tono?: TonoFicha;
  grande?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
        grande ? "size-14 [&_svg]:size-7" : "size-12 [&_svg]:size-6",
        CHIP[tono],
      )}
    >
      <Icono />
    </span>
  );
}

/**
 * Un bloque de la ficha: tarjeta con su icono, su título en grande y, a la
 * derecha, sus botones. El título es un `h2` dentro de `header`, así que
 * recibe también el filo azul → dorado que tokens.css pone a toda tarjeta.
 */
export function BloqueFicha({
  icono,
  titulo,
  ayuda,
  acciones,
  tono = "marca",
  className,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  /** Una frase que dice para qué sirve el bloque, en tuteo. */
  ayuda?: React.ReactNode;
  acciones?: React.ReactNode;
  tono?: TonoFicha;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("card elev-1 flex min-w-0 flex-col gap-4 p-4 sm:p-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ChipIcono icono={icono} tono={tono} />
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{titulo}</h2>
            {ayuda ? <p className="mt-0.5 text-base text-muted">{ayuda}</p> : null}
          </div>
        </div>
        {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Una cifra con su rótulo, grande, con el filo de su color. Sin `truncate`:
 * con la letra a 24 px una cifra cortada es una cifra que no existe.
 */
export function CifraFicha({
  etiqueta,
  valor,
  pie,
  icono,
  tono = "marca",
  pintarCifra = false,
  className,
  children,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  pie?: React.ReactNode;
  icono?: LucideIcon;
  tono?: TonoFicha;
  /** Pintar también la cifra (solo cuando el color ES el mensaje: sin stock). */
  pintarCifra?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "card elev-1 flex min-w-0 flex-col gap-1 border-l-4 p-4",
        FILO[tono],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold text-fg">{etiqueta}</p>
        {icono ? <ChipIcono icono={icono} tono={tono} /> : null}
      </div>
      <p
        className={cn(
          "tabular break-words text-3xl font-extrabold leading-tight tracking-tight",
          pintarCifra ? TEXTO[tono] : "text-[var(--titulo)]",
        )}
      >
        {valor}
      </p>
      {pie ? <div className="text-sm text-muted">{pie}</div> : null}
      {children}
    </div>
  );
}

/**
 * Un dato de la ficha: rótulo arriba, valor debajo. Un valor que falta se
 * dice con palabras y en gris («sin registrar»), no con un «—» que parece un
 * hueco por llenar: la mitad del catálogo entró de un Excel a medias.
 */
export function DatoFicha({
  etiqueta,
  valor,
  falta = false,
  mono = false,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  /** El valor es un «sin registrar»: va en gris y sin negrita. */
  falta?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="etiqueta-dato">{etiqueta}</dt>
      <dd
        className={cn(
          "break-words text-base",
          falta ? "text-muted" : "font-semibold text-fg",
          mono && !falta && "font-mono",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Una sección numerada de formulario: el círculo azul con su número, título
 * grande y una frase de ayuda. Es la `Seccion` de /accesibilidad (27/11), que
 * es el lenguaje aprobado: numerar dice cuántos pasos hay y en cuál estás.
 */
export function SeccionNumerada({
  numero,
  titulo,
  ayuda,
  extra,
  children,
}: {
  numero: number;
  titulo: string;
  ayuda?: React.ReactNode;
  /** A la derecha del título: «En dólares y sin IGV». */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `seccion-${numero}`;
  return (
    <section aria-labelledby={id} className="card elev-1 flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
            aria-hidden="true"
          >
            {numero}
          </span>
          <div className="min-w-0">
            <h2 id={id} className="text-xl font-bold text-[var(--titulo)]">
              {titulo}
            </h2>
            {ayuda ? <p className="mt-0.5 text-base text-muted">{ayuda}</p> : null}
          </div>
        </div>
        {extra ? <div className="text-base text-muted">{extra}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** La pastilla grande de un estado, con su palabra. */
export function PastillaEstado({
  tono,
  icono: Icono,
  children,
}: {
  tono: TonoFicha;
  icono?: LucideIcon;
  children: React.ReactNode;
}) {
  const fondo: Record<TonoFicha, string> = {
    ok: "bg-ok-bg text-ok border-[var(--ok)]/30",
    aviso: "bg-warn-bg text-warn border-[var(--warn)]/40",
    malo: "bg-danger-bg text-danger border-[var(--danger)]/40",
    info: "bg-info-bg text-info border-[var(--info)]/30",
    marca: "bg-brand-50 text-brand-700 border-brand-100 dark:bg-surface-3 dark:text-brand-200",
    neutro: "bg-surface-2 text-muted border-[var(--border)]",
  };
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-base font-bold",
        fondo[tono],
      )}
    >
      {Icono ? <Icono className="size-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
