"use client";

// Cliente por tres motivos concretos: `window.print()`, el estado de "en curso"
// mientras la acción va y viene, y la confirmación antes de anular. Nada más
// de esta pantalla necesita JavaScript.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rodatech/ui";

import { aprobar, cambiarEstado, clonar } from "../../acciones/gestionar";
import type { EstadoCotizacion } from "../../dominio/tipos";

/**
 * Acciones de una cotización.
 *
 * Antes eran hasta ocho botones en fila: en un teléfono se desbordaban y en
 * escritorio no se distinguía cuál era EL siguiente paso.
 *
 * Ahora hay una sola acción principal —la que corresponde al estado— y el
 * resto vive en el menú de tres puntos, igual que en el catálogo. Que el botón
 * destacado cambie con el estado es la mitad del valor: en un borrador dice
 * «Aprobar», en una aprobada dice «Generar guía», y no hay que pensar.
 */
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
    <div className="flex flex-col items-stretch gap-2 sm:items-end print:hidden">
      <div className="flex items-center justify-end gap-2">
        {/* El siguiente paso, según dónde esté el documento. */}
        {enCurso ? (
          <Button disabled={pendiente} onClick={() => correr(() => aprobar(id))}>
            Aprobar
          </Button>
        ) : estado === "aprobada" ? (
          <Button onClick={() => router.push(`/guias/nueva?cotizacion=${id}`)}>
            Generar guía
          </Button>
        ) : null}

        <Button variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Más acciones"
            className="flex size-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:size-9"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="19" r="1.8" fill="currentColor" />
            </svg>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {enlaceWhatsapp ? (
              <DropdownMenuItem asChild>
                <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer">
                  Enviar por WhatsApp
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled
                title="El cliente no tiene un teléfono válido registrado"
              >
                Enviar por WhatsApp
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              disabled={pendiente}
              onSelect={() => correr(() => clonar(id))}
            >
              Clonar
              <span className="ml-auto text-xs text-[var(--fg-subtle)]">
                precios de hoy
              </span>
            </DropdownMenuItem>

            {estado === "borrador" ? (
              <DropdownMenuItem
                disabled={pendiente}
                onSelect={() => correr(() => cambiarEstado(id, "enviada"))}
              >
                Marcar como enviada
              </DropdownMenuItem>
            ) : null}

            {enCurso ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pendiente}
                  onSelect={() => correr(() => cambiarEstado(id, "rechazada"))}
                >
                  El cliente la rechazó
                </DropdownMenuItem>
              </>
            ) : null}

            {viva ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pendiente}
                  className="text-[var(--danger)]"
                  onSelect={() => {
                    // Anular no se deshace: si no se pregunta, se anula por error.
                    if (window.confirm("¿Anular esta cotización? No se puede deshacer.")) {
                      correr(() => cambiarEstado(id, "anulada"));
                    }
                  }}
                >
                  Anular
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pendiente ? (
        <span className="text-right text-sm text-[var(--fg-muted)]">Procesando…</span>
      ) : null}
      {error ? (
        <span className="text-right text-sm text-[var(--danger)]">{error}</span>
      ) : null}
    </div>
  );
}
