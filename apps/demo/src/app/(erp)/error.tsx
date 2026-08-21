"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Frontera de error de los módulos.
 *
 * Sin esto, una consulta que falla se confunde con un registro inexistente y la
 * pantalla muestra un 404 que oculta la causa real.
 */
export default function ErrorModulo({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Rodatech ERP]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span
        className="mb-4 flex size-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
      >
        <AlertTriangle className="size-6" />
      </span>

      <h1 className="text-lg font-semibold text-fg">No se pudo cargar esta sección</h1>
      <p className="mt-1.5 max-w-md text-[13px] text-muted">
        Ocurrió un problema al consultar la información. El registro puede existir: lo que falló fue
        la lectura.
      </p>

      <pre className="mt-4 max-w-xl overflow-x-auto rounded-lg border bg-[var(--surface-2)] px-3.5 py-2.5 text-left text-[11px] text-muted">
        {error.message}
        {error.digest && `\n\nReferencia: ${error.digest}`}
      </pre>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCcw />
          Reintentar
        </Button>
        <Link href="/dashboard">
          <Button variant="outline">
            <ArrowLeft />
            Ir al tablero
          </Button>
        </Link>
      </div>
    </div>
  );
}
