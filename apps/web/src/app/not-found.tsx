import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="font-mono text-sm text-[var(--fg-subtle)]">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Esta página no existe
        </h1>
        <p className="text-[var(--fg-muted)]">
          Puede que la dirección esté mal escrita, o que el módulo todavía no
          esté construido.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-sm bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          Ir al tablero
        </Link>
      </div>
    </main>
  );
}
