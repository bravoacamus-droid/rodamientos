"use client";

// Cliente: abre el menú y el diálogo, y llama a la acción de servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Textarea,
} from "@rodatech/ui";

import { bloquearCliente } from "../acciones/guardar";

/**
 * Menú de acciones de un cliente.
 *
 * Va al final de la fila en escritorio y a la derecha de la tarjeta en móvil:
 * el mismo menú en los dos sitios, para que la acción esté siempre donde la
 * mano ya la busca.
 *
 * Cada opción respeta el rol: quien no puede editar no ve «Editar» ni
 * «Bloquear». Un botón que aparece y luego rebota es peor que no verlo.
 */

export interface AccionesFilaProps {
  id: string;
  codigo: string;
  razonSocial: string;
  bloqueado: boolean;
  puedeEditar: boolean;
}

export function AccionesFila({
  id,
  codigo,
  razonSocial,
  bloqueado,
  puedeEditar,
}: AccionesFilaProps) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${razonSocial}`}
          // 44 px en móvil, 36 en escritorio: en la tabla el ratón apunta fino,
          // en la tarjeta apunta un pulgar.
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] md:size-9"
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" fill="currentColor" />
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <circle cx="12" cy="19" r="1.8" fill="currentColor" />
          </svg>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => router.push(`/clientes/${id}`)}>
            Ver cliente
          </DropdownMenuItem>

          {puedeEditar ? (
            <DropdownMenuItem onSelect={() => router.push(`/clientes/${id}/editar`)}>
              Editar cliente
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          {/* Cotizar con el cliente ya puesto: es el camino que se recorre
              veinte veces al día y no debería pasar por el buscador otra vez.
              A un bloqueado no se le cotiza: la opción no aparece. */}
          {!bloqueado ? (
            <DropdownMenuItem
              onSelect={() => router.push(`/cotizaciones/nueva?cliente=${id}`)}
            >
              Cotizar a este cliente
            </DropdownMenuItem>
          ) : null}

          {puedeEditar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setAbierto(true)}
                className={bloqueado ? "" : "text-[var(--danger)]"}
              >
                {bloqueado ? "Desbloquear cliente" : "Bloquear cliente"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoBloqueo
        abierto={abierto}
        cerrar={() => setAbierto(false)}
        id={id}
        codigo={codigo}
        razonSocial={razonSocial}
        bloqueado={bloqueado}
        onHecho={() => router.refresh()}
      />
    </>
  );
}

/**
 * Bloqueo y desbloqueo.
 *
 * Bloquear NO es dar de baja: el cliente conserva su historial y sus
 * documentos, solo deja de poder cotizársele y venderle a crédito. Por eso se
 * pide un motivo — dentro de tres meses alguien va a preguntar por qué este
 * cliente no aparece en el cotizador, y la respuesta tiene que estar escrita.
 */
function DialogoBloqueo({
  abierto,
  cerrar,
  id,
  codigo,
  razonSocial,
  bloqueado,
  onHecho,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  codigo: string;
  razonSocial: string;
  bloqueado: boolean;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  // Al reabrirlo para otro cliente los campos tienen que empezar limpios.
  React.useEffect(() => {
    if (abierto) {
      setMotivo("");
      setError(null);
    }
  }, [abierto]);

  const confirmar = () => {
    setError(null);
    iniciar(async () => {
      const r = await bloquearCliente(id, !bloqueado, motivo.trim());
      if (r.ok) {
        onHecho();
        cerrar();
      } else {
        setError(r.error ?? "No se pudo completar.");
      }
    });
  };

  // Solo al bloquear. Desbloquear es volver a la normalidad y no necesita
  // justificarse.
  const faltaMotivo = !bloqueado && motivo.trim().length < 4;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{bloqueado ? "Desbloquear cliente" : "Bloquear cliente"}</DialogTitle>
        <DialogDescription>
          {bloqueado ? (
            <>
              {codigo} · {razonSocial} vuelve a la cartera y se le podrá cotizar
              y facturar otra vez.
            </>
          ) : (
            <>
              {codigo} · {razonSocial} deja de aparecer en el cotizador, pero{" "}
              <strong>no se borra</strong>: conserva sus documentos y su deuda, y
              lo puedes desbloquear cuando quieras.
            </>
          )}
        </DialogDescription>

        {!bloqueado ? (
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-medium">Motivo</span>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Tiene tres facturas vencidas desde julio."
            />
            <span className="text-xs text-[var(--fg-muted)]">
              Obligatorio. Queda en la ficha para que el siguiente que lo mire
              sepa por qué está así.
            </span>
          </label>
        ) : null}

        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={cerrar}
            className="h-11 w-full sm:w-auto md:h-control-md"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={bloqueado ? "primary" : "danger"}
            disabled={pendiente || faltaMotivo}
            onClick={confirmar}
            className="h-11 w-full sm:w-auto md:h-control-md"
          >
            {pendiente ? "Un momento…" : bloqueado ? "Desbloquear" : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
