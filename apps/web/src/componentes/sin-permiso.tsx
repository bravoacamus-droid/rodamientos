"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { toast } from "@rodatech/ui";

/**
 * Lo que se enseña cuando el rol no puede (143).
 *
 * El QA, 20/10: *«cuando no tiene permisos deja rellenar datos y al intentar
 * guardar no lo permite. Propuesta: bloquear el botón y avisar»*. Esconder el
 * botón —lo que se hacía— tampoco servía: quien no lo ve no sabe que existe
 * ni a quién pedirlo. Así que el botón SALE, con candado, en gris, y al
 * pulsarlo dice por qué no y a quién pedírselo.
 */
export function BotonBloqueado({
  children,
  mensaje,
  className = "",
}: {
  children: React.ReactNode;
  mensaje: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title={mensaje}
      onClick={() => toast.info(mensaje, { duration: 8000 })}
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--fg-muted)] md:h-control-md ${className}`}
    >
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * El aviso en lugar de un formulario que no se va a poder guardar: se dice
 * ANTES de que llene nada, no al final.
 */
export function AvisoSinPermiso({ mensaje, className = "" }: { mensaje: string; className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm ${className}`}
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" aria-hidden="true" />
      <p>{mensaje}</p>
    </div>
  );
}
