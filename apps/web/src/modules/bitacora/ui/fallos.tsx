"use client";

// Cliente por una sola cosa: marcar un fallo como revisado sin recargar.

import * as React from "react";
import { Badge, Button, formatearFechaHora } from "@rodatech/ui";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { marcarRevisado } from "../acciones/fallos";
import type { Fallo } from "../api/consultas";

/**
 * Lo que se rompió y nadie te contó.
 *
 * De la auditoría del 31/08 (§0.2). Van apilados por huella: un fallo que
 * ocurre cien veces es un fallo, no cien, y lo que decide si esta lista se
 * mira es que quepa de un vistazo.
 *
 * Marcar como revisado no borra nada. Y libera la huella: si el fallo vuelve,
 * abre fila nueva y se nota que volvió.
 */
export function Fallos({ fallos }: { fallos: Fallo[] }) {
  const router = useRouter();
  const [marcando, marcar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (fallos.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Nada roto sin revisar. Aquí salen los errores de servidor que hasta
        ahora morían en la pantalla de quien los provocaba.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm">
          {error}
        </p>
      ) : null}

      {fallos.map((f) => (
        <div
          key={f.id}
          className="flex flex-wrap items-start gap-3 rounded-md border border-[var(--border)] p-3"
        >
          <div className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-sm font-medium">{f.origen}</code>
              {f.veces > 1 ? (
                <Badge tone="danger" size="xs">
                  {f.veces} veces
                </Badge>
              ) : null}
              {f.codigo ? (
                <Badge tone="neutral" size="xs">
                  {f.codigo}
                </Badge>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm">{f.mensaje}</span>
            <span className="mt-0.5 block text-xs text-[var(--fg-subtle)]">
              {formatearFechaHora(f.ultima_vez)}
              {f.veces > 1 ? ` · la primera, ${formatearFechaHora(f.primera_vez)}` : ""}
              {f.ruta ? ` · en ${f.ruta}` : ""}
              {` · lo vio ${f.usuario_nombre}`}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={marcando}
            onClick={() =>
              marcar(async () => {
                const r = await marcarRevisado(f.id);
                if (!r.ok) setError(r.error);
                else router.refresh();
              })
            }
          >
            <Check aria-hidden="true" />
            Ya está visto
          </Button>
        </div>
      ))}
    </div>
  );
}
