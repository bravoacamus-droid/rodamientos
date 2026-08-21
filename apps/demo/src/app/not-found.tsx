import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/marca/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-app px-6 text-center">
      <Logo height={44} />
      <div>
        <p className="text-6xl font-bold tracking-tight text-brand-600">404</p>
        <h1 className="mt-2 text-lg font-semibold text-fg">Página no encontrada</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">
          La ruta solicitada no existe dentro del ERP o fue movida a otro módulo.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-9.5 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        <ArrowLeft className="size-4" />
        Volver al tablero
      </Link>
    </main>
  );
}
