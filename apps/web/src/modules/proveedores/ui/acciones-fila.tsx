"use client";

// Cliente: abre el menú y el diálogo, y llama a la acción de servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
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
} from "@rodatech/ui";

import { cambiarEstadoProveedor } from "../acciones/estado";

/**
 * Menú de acciones de un proveedor.
 *
 * Va al final de la fila en escritorio y a la derecha de la tarjeta en móvil:
 * el mismo menú en los dos sitios, para que la acción esté donde la mano ya la
 * busca. Quien no puede editar no ve «Editar» ni «Dar de baja».
 */
export function AccionesFila({
  id,
  razonSocial,
  activo,
  puedeEditar,
}: {
  id: string;
  razonSocial: string;
  activo: boolean;
  puedeEditar: boolean;
}) {
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
          <DropdownMenuItem onSelect={() => router.push(`/proveedores/${id}`)}>
            Ver proveedor
          </DropdownMenuItem>

          {puedeEditar ? (
            <DropdownMenuItem
              onSelect={() => router.push(`/proveedores/${id}/editar`)}
            >
              Editar proveedor
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          {/* Recibir con el proveedor ya puesto. A uno de baja no se le recibe:
              la opción no aparece. */}
          {activo ? (
            <DropdownMenuItem
              onSelect={() => router.push(`/recepciones/nueva?proveedor=${id}`)}
            >
              Recibir mercadería suya
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            onSelect={() => router.push(`/recepciones?proveedor=${id}`)}
          >
            Ver sus recepciones
          </DropdownMenuItem>

          {puedeEditar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setAbierto(true)}
                className={activo ? "text-[var(--danger)]" : ""}
              >
                {activo ? "Dar de baja" : "Reactivar proveedor"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoBaja
        abierto={abierto}
        cerrar={() => setAbierto(false)}
        id={id}
        razonSocial={razonSocial}
        activo={activo}
        onHecho={() => router.refresh()}
      />
    </>
  );
}

/**
 * Baja y reactivación.
 *
 * Dar de baja NO borra: el proveedor conserva su histórico de compras y
 * recepciones, solo deja de aparecer en los desplegables. Es lo correcto —la
 * mercadería que hay en almacén vino de alguien— y además lo único posible:
 * las claves foráneas van con `on delete restrict`.
 *
 * No se pide motivo, a diferencia del bloqueo de un cliente: allí el motivo
 * responde a «¿por qué no puedo venderle?», una pregunta que se hace en
 * caliente y con un cliente delante. Dejar de comprarle a alguien no genera
 * esa urgencia.
 */
function DialogoBaja({
  abierto,
  cerrar,
  id,
  razonSocial,
  activo,
  onHecho,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  razonSocial: string;
  activo: boolean;
  onHecho: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  React.useEffect(() => {
    if (abierto) setError(null);
  }, [abierto]);

  const confirmar = () => {
    setError(null);
    iniciar(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("activo", activo ? "0" : "1");

      const r = await cambiarEstadoProveedor(null, fd);
      if (r.ok) {
        onHecho();
        cerrar();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {activo ? "Dar de baja" : "Reactivar proveedor"}
          </DialogTitle>
          <DialogDescription>
            {activo ? (
              <>
                <strong>{razonSocial}</strong> deja de aparecer al registrar
                compras y recepciones, pero <strong>no se borra</strong>: sus
                recepciones antiguas siguen enseñando su nombre y lo puedes
                reactivar cuando quieras.
              </>
            ) : (
              <>
                <strong>{razonSocial}</strong> vuelve a estar disponible para
                comprarle y recibir su mercadería.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
            variant={activo ? "danger" : "primary"}
            disabled={pendiente}
            onClick={confirmar}
            className="h-11 w-full sm:w-auto md:h-control-md"
          >
            {pendiente ? "Un momento…" : activo ? "Dar de baja" : "Reactivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
