"use client";

// Cliente: abre el menú y el diálogo, y llama a la acción de servidor.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Eye, SquarePen } from "lucide-react";
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
  ancho = false,
}: {
  id: string;
  razonSocial: string;
  activo: boolean;
  puedeEditar: boolean;
  /**
   * A lo ancho, para la tarjeta de móvil.
   *
   * En la tabla los botones van a la derecha de la fila y miden lo que miden.
   * En una tarjeta de 360 px, al lado del nombre lo aplastan —pasó el 11/09,
   * al sacarlos del menú de tres puntos— así que ahí van debajo,
   * repartiéndose el ancho, que es como se pulsa con el pulgar.
   */
  ancho?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <div className={`flex items-center gap-1.5 ${ancho ? "w-full" : "justify-end"}`}>
      {/*
        Ver y Editar, fuera del menú.

        Luis, 11/09, con su prototipo: en cada fila de proveedores, **Ver** y
        **Editar**. Aquí la acción corriente no es cotizar —a un proveedor no
        se le cotiza— sino corregirle la ficha: el RUC antes de registrar su
        factura, los días de pago cuando cambian, la marca que empezó a
        traer. Eso es lo que sale a la vista.
      */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className={`gap-1.5 ${ancho ? "flex-1" : ""}`}
      >
        <Link href={`/proveedores/${id}`}>
          <Eye className="size-4" aria-hidden="true" />
          Ver
        </Link>
      </Button>

      {puedeEditar ? (
        <Button asChild size="sm" className={`gap-1.5 ${ancho ? "flex-1" : ""}`}>
          <Link href={`/proveedores/${id}/editar`}>
            <SquarePen className="size-4" aria-hidden="true" />
            Editar
          </Link>
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${razonSocial}`}
          // Con borde, y en la tarjeta con su palabra: tres puntos grises
          // sueltos no decían que ahí están «Recibir mercadería suya» y «Dar
          // de baja» (revisión por módulos del 02/10). En la tabla, solo el
          // icono con borde, como en productos y clientes, para que la fila
          // quepa. 36 px de alto, el de «Ver» y «Editar».
          type="button"
          title="Más acciones"
          className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${ancho ? "px-2.5" : "w-9"}`}
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
          {ancho ? "Más" : null}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Ver y Editar ya están fuera, en sus botones. Aquí queda lo que
              se hace de tarde en tarde. */}

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
    </div>
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
