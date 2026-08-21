"use client";

// Cliente por tres motivos concretos: `window.print()`, el estado de "en curso"
// mientras la acción va y viene, y la confirmación antes de anular. Nada más
// de esta pantalla necesita JavaScript.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@rodatech/ui";

import { aprobar, cambiarEstado, clonar } from "../../acciones/gestionar";
import type { EstadoCotizacion } from "../../dominio/tipos";

export function AccionesCotizacion({
  id,
  estado,
  enlaceWhatsapp,
}: {
  id: string;
  estado: EstadoCotizacion;
  enlaceWhatsapp: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const correr = (f: () => Promise<{ ok: boolean; error?: string; id?: string }>) => {
    setError(null);
    iniciar(async () => {
      const r = await f();
      if (!r.ok) setError(r.error ?? "No se pudo completar la acción.");
      else if (r.id) router.push(`/cotizaciones/${r.id}`);
      else router.refresh();
    });
  };

  const enCurso = estado === "borrador" || estado === "enviada";
  const viva = enCurso || estado === "aprobada";

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>

        {enlaceWhatsapp ? (
          <Button variant="outline" asChild>
            <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled
            title="El cliente no tiene un teléfono válido registrado"
          >
            WhatsApp
          </Button>
        )}

        <Button
          variant="outline"
          disabled={pendiente}
          onClick={() => correr(() => clonar(id))}
        >
          Clonar
        </Button>

        {estado === "borrador" ? (
          <Button
            variant="outline"
            disabled={pendiente}
            onClick={() => correr(() => cambiarEstado(id, "enviada"))}
          >
            Marcar como enviada
          </Button>
        ) : null}

        {enCurso ? (
          <>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => correr(() => cambiarEstado(id, "rechazada"))}
            >
              Rechazada
            </Button>
            <Button disabled={pendiente} onClick={() => correr(() => aprobar(id))}>
              Aprobar
            </Button>
          </>
        ) : null}

        {estado === "aprobada" ? (
          <Button onClick={() => router.push(`/guias/nueva?cotizacion=${id}`)}>
            Generar guía
          </Button>
        ) : null}

        {viva ? (
          <Button
            variant="ghost"
            disabled={pendiente}
            onClick={() => {
              // Anular no se deshace: si no se pregunta, se anula por error.
              if (window.confirm("¿Anular esta cotización? No se puede deshacer.")) {
                correr(() => cambiarEstado(id, "anulada"));
              }
            }}
            className="text-[var(--danger)]"
          >
            Anular
          </Button>
        ) : null}
      </div>

      {pendiente ? (
        <span className="text-sm text-[var(--fg-muted)]">Procesando…</span>
      ) : null}
      {error ? <span className="text-sm text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}
