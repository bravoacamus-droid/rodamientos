"use client";

// Cliente: abre el menú y el diálogo, y llama a la acción de servidor.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Eye, Lock, LockOpen, Plus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
 * Las acciones de un cliente: dos a la vista y el resto en el menú.
 *
 * ---------------------------------------------------------------------------
 * Por qué «Ver» y «Cotizar» salen del menú
 * ---------------------------------------------------------------------------
 * Estaban las cuatro dentro de un icono de tres puntos. Y «Cotizar a este
 * cliente» llevaba escrito al lado, desde que se construyó, que *«es el
 * camino que se recorre veinte veces al día y no debería pasar por el
 * buscador otra vez»* — detrás de tres puntos grises que no dicen que se
 * pueden pulsar.
 *
 * Luis, 11/09, con su prototipo: en cada fila, **Ver** y **+ Cotizar**. Es
 * la regla de esta casa aplicada a una tabla: un botón tiene que parecer un
 * botón, y lo que se hace veinte veces al día no se esconde.
 *
 * En el menú se queda lo que se hace de tarde en tarde: editar la ficha y
 * bloquear. Sacar las cuatro dejaría una fila con más botones que datos.
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
  /**
   * A lo ancho, para la tarjeta de móvil.
   *
   * En la tabla los botones van a la derecha de la fila y miden lo que
   * miden. En una tarjeta de 360 px puestos al lado del nombre lo aplastan
   * —pasó el 11/09, al sacarlos del menú de tres puntos— así que ahí van
   * debajo, repartiéndose el ancho, que es como se pulsa con el pulgar.
   */
  ancho?: boolean;
  /** En la ficha del cliente: sin «Ver», que sería un enlace a la misma página. */
  enFicha?: boolean;
}

export function AccionesFila({
  id,
  codigo,
  razonSocial,
  bloqueado,
  puedeEditar,
  ancho = false,
  enFicha = false,
}: AccionesFilaProps) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <div className={`flex items-center gap-1.5 ${ancho ? "w-full" : "justify-end"}`}>
      {enFicha ? null : (
        <Button
          asChild
          variant="outline"
          size="sm"
          className={`gap-1.5 ${ancho ? "flex-1" : ""}`}
        >
          <Link href={`/clientes/${id}`}>
            <Eye className="size-4" aria-hidden="true" />
            Ver
          </Link>
        </Button>
      )}

      {/* A un cliente bloqueado no se le cotiza: el botón no aparece, en vez
          de aparecer y rebotar al pulsarlo. */}
      {!bloqueado ? (
        <Button asChild size="sm" className={`gap-1.5 ${ancho ? "flex-1" : ""}`}>
          <Link href={`/cotizaciones/nueva?cliente=${id}`}>
            <Plus className="size-4" aria-hidden="true" />
            Cotizar
          </Link>
        </Button>
      ) : null}

      {/*
        En la ficha, sin menú: «Editar» ya es un botón al lado, así que en el
        menú solo quedaba «Bloquear», detrás de tres puntos. Un botón con su
        nombre lo dice sin abrir nada, y el diálogo pide el motivo antes de
        tocar nada (revisión por módulos del 02/10). Y sin permiso de edición
        no se pinta ni el menú: salía vacío.
      */}
      {!puedeEditar ? null : enFicha ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setAbierto(true)}
        >
          {bloqueado ? (
            <LockOpen className="size-4" aria-hidden="true" />
          ) : (
            <Lock className="size-4" aria-hidden="true" />
          )}
          {bloqueado ? "Desbloquear" : "Bloquear"}
        </Button>
      ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${razonSocial}`}
          // Con borde, y en la tarjeta con su palabra: tres puntos grises
          // sueltos no dicen que ahí están Editar y Bloquear (revisión por
          // módulos del 02/10). En la tabla va solo el icono con borde, como
          // en productos: con «Más» la fila no cabía a 1280 y la columna de
          // estado quedaba debajo de la de acciones. 36 px de alto, el de
          // «Ver» y «Cotizar», para que los tres midan lo mismo.
          type="button"
          title="Más acciones"
          className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${ancho ? "px-2.5" : "w-9"}`}
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
          {ancho ? "Más" : null}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Ver y Cotizar ya están fuera, en sus botones. Aquí queda lo que
              se hace de tarde en tarde. */}
          {puedeEditar ? (
            <DropdownMenuItem
              onSelect={() => router.push(`/clientes/${id}/editar`)}
            >
              Editar cliente
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
      )}

      <DialogoBloqueo
        abierto={abierto}
        cerrar={() => setAbierto(false)}
        id={id}
        codigo={codigo}
        razonSocial={razonSocial}
        bloqueado={bloqueado}
        onHecho={() => router.refresh()}
      />
    </div>
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
        <DialogHeader>
          <DialogTitle>
            {bloqueado ? "Desbloquear cliente" : "Bloquear cliente"}
          </DialogTitle>
          <DialogDescription>
            {bloqueado ? (
              <>
                {codigo} · {razonSocial} vuelve a la cartera y se le podrá
                cotizar y facturar otra vez.
              </>
            ) : (
              <>
                {codigo} · {razonSocial} deja de aparecer en el cotizador, pero{" "}
                <strong>no se borra</strong>: conserva sus documentos y su
                deuda, y lo puedes desbloquear cuando quieras.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!bloqueado ? (
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-sm font-medium">Motivo</span>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Tiene tres facturas vencidas desde julio."
              />
              <span className="text-sm text-[var(--fg-muted)]">
                Obligatorio. Queda en la ficha para que el siguiente que lo mire
                sepa por qué está así.
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
          ) : null}
        </DialogBody>
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
