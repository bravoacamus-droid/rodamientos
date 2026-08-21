import Link from "next/link";

/**
 * Marcador de un módulo que todavía no existe.
 *
 * Está para que la navegación funcione entera desde el primer día y para que
 * quien la recorra sepa qué va a haber aquí y cuándo, en vez de chocarse con
 * un 404. Cada uno se borra cuando su módulo entra: la ruta pasa a ser
 * `export { PaginaX as default } from "@/modules/x"`.
 */
export function EnConstruccion({
  titulo,
  descripcion,
  fase,
  hara,
}: {
  titulo: string;
  descripcion: string;
  fase: string;
  hara: readonly string[];
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          <span className="rounded-sm bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn)]">
            {fase}
          </span>
        </div>
        <p className="text-[var(--fg-muted)]">{descripcion}</p>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
          Qué va a hacer
        </h2>
        <ul className="flex flex-col gap-2">
          {hara.map((punto) => (
            <li key={punto} className="flex gap-2.5 text-sm">
              <span
                aria-hidden
                className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-brand-600"
              />
              <span>{punto}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-[var(--fg-subtle)]">
        El plan completo está en <code>docs/PLAN-V2.md</code>.{" "}
        <Link
          href="/dashboard"
          className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
        >
          Volver al tablero
        </Link>
      </p>
    </div>
  );
}
