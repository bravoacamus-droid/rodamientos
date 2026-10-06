"use client";

// Cliente: abre menús y diálogos, y llama a las acciones de servidor.

import * as React from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
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
  Input,
} from "@rodatech/ui";

import { archivarProducto } from "../acciones/guardar";
import { DialogoStock } from "./dialogo-stock";

/**
 * Menú de acciones de una fila del catálogo.
 *
 * Va al final de la fila, después del estado. Los tres puntos son el patrón
 * que la gente ya conoce, y evitan una hilera de botones que en un teléfono no
 * cabría.
 *
 * Cada acción respeta el rol: quien no puede archivar no ve "Dar de baja",
 * porque un botón que aparece y luego rebota es peor que no verlo.
 */

export interface AccionesFilaProps {
  id: string;
  codigo: string;
  descripcion: string;
  stock: number;
  archivado: boolean;
  puedeEditar: boolean;
  puedeAjustarStock: boolean;
  /**
   * En la ficha ya se está viendo el producto y «Editar» es un botón al lado:
   * repetirlos en el menú era decir lo mismo dos veces (revisión por módulos
   * del 02/10).
   */
  enFicha?: boolean;
}

export function AccionesFila({
  id,
  codigo,
  descripcion,
  stock,
  archivado,
  puedeEditar,
  puedeAjustarStock,
  enFicha = false,
}: AccionesFilaProps) {
  const router = useRouter();
  const [dialogo, setDialogo] = React.useState<
    "ninguno" | "stock" | "archivar"
  >("ninguno");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${codigo}`}
          // Con borde, como el menú de las piezas del kit: los tres puntos
          // sueltos en gris no parecían un botón (revisión por módulos del
          // 02/10).
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {enFicha ? null : (
            <DropdownMenuItem onSelect={() => router.push(`/productos/${id}`)}>
              Ver producto
            </DropdownMenuItem>
          )}

          {puedeEditar && !enFicha ? (
            <DropdownMenuItem
              onSelect={() => router.push(`/productos/${id}/editar`)}
            >
              Editar producto
            </DropdownMenuItem>
          ) : null}

          {puedeAjustarStock && !archivado ? (
            <DropdownMenuItem onSelect={() => setDialogo("stock")}>
              Actualizar stock
              <span className="ml-auto tabular text-sm text-[var(--fg-muted)]">
                {stock}
              </span>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => router.push(`/cotizaciones/nueva?producto=${id}`)}
          >
            Cotizar este producto
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => router.push(`/inventario/kardex?producto=${id}`)}
          >
            Ver kardex
          </DropdownMenuItem>

          {puedeEditar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDialogo("archivar")}
                className={archivado ? "" : "text-[var(--danger)]"}
              >
                {archivado ? "Reactivar producto" : "Dar de baja"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoStock
        abierto={dialogo === "stock"}
        cerrar={() => setDialogo("ninguno")}
        id={id}
        codigo={codigo}
        descripcion={descripcion}
        stock={stock}
      />

      <DialogoArchivar
        abierto={dialogo === "archivar"}
        cerrar={() => setDialogo("ninguno")}
        id={id}
        codigo={codigo}
        archivado={archivado}
        onHecho={() => router.refresh()}
      />
    </>
  );
}


/**
 * Baja y reactivación.
 *
 * Archivar NO es borrar (24:21): el producto sale del cotizador, conserva su
 * historial y se puede reactivar. Por eso el texto dice "dar de baja" y no
 * "eliminar", y por eso se pregunta antes.
 */
function DialogoArchivar({
  abierto,
  cerrar,
  id,
  codigo,
  archivado,
  onHecho,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  codigo: string;
  archivado: boolean;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  React.useEffect(() => {
    if (abierto) {
      setMotivo("");
      setError(null);
    }
  }, [abierto]);

  const confirmar = () => {
    setError(null);
    iniciar(async () => {
      const r = await archivarProducto(id, !archivado, motivo);
      if (r.ok) {
        onHecho();
        cerrar();
      } else {
        setError(r.error ?? "No se pudo completar.");
      }
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {archivado ? "Reactivar producto" : "Dar de baja"}
          </DialogTitle>
          <DialogDescription>
            {archivado ? (
              <>{codigo} vuelve al catálogo y se podrá cotizar otra vez.</>
            ) : (
              <>
                {codigo} sale de las cotizaciones y del buscador, pero{" "}
                <strong>no se borra</strong>: conserva su historial y lo puedes
                reactivar cuando quieras.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {!archivado ? (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Motivo (opcional)</span>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descontinuado por el fabricante"
              />
            </label>
          ) : null}

          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={archivado ? "primary" : "danger"}
            disabled={pendiente}
            onClick={confirmar}
          >
            {pendiente
              ? "Un momento…"
              : archivado
                ? "Reactivar"
                : "Dar de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
