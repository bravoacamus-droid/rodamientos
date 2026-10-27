"use client";

// Cliente: pregunta a la base antes de confirmar y vuelve a la lista al terminar.

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Hash, LoaderCircle, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@rodatech/ui";

import { eliminarCotizacion, previaEliminarCotizacion } from "../acciones/gestionar";
import { type PreviaEliminar, avisoDelNumero, avisoEliminada } from "../dominio/eliminar";

/**
 * «Eliminar cotización» (164), el mismo en la ficha y en la lista.
 *
 * Luis, 27/10: *«ponte que elimino la COT-010, la cotización que voy a crear
 * tiene que ser la 010, no la 11»*. Si se puede o no, y qué pasa con el
 * número, lo dice la base (`previa_eliminar_cotizacion`) al abrir: solo ella
 * sabe si tiene pedido, guía o compras y si es la última de su serie. Así el
 * diálogo no promete un número que luego no sale.
 *
 * Se monta solo mientras está abierto: cada vez que se abre, pregunta de nuevo.
 */
export function DialogoEliminarCotizacion({
  id,
  numero,
  onCerrar,
}: {
  id: string;
  numero: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [previa, setPrevia] = React.useState<PreviaEliminar | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  React.useEffect(() => {
    let vivo = true;
    void previaEliminarCotizacion(id).then((r) => {
      if (!vivo) return;
      if (r.ok) setPrevia(r.previa);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const r = await eliminarCotizacion(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
      toast.success(`Cotización ${r.numero} eliminada`, {
        richColors: true,
        position: "top-center",
        duration: 8000,
        description: avisoEliminada(r),
      });
      router.push("/cotizaciones");
      router.refresh();
    });

  const cargando = !previa && !error;
  const sePuede = previa !== null && previa.motivo === null;

  return (
    <Dialog open onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent ancho="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-600 text-white">
              <Trash2 className="size-5" aria-hidden="true" />
            </span>
            <span>
              Eliminar la cotización <span className="font-mono">{previa?.numero ?? numero}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="text-base">
            {previa?.motivo
              ? "Hay documentos que dependen de ella."
              : "Se borra entera, con sus productos. No se puede deshacer."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {cargando ? (
            <p className="flex items-center gap-2 text-base text-[var(--fg-muted)]">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Revisando si tiene pedidos, guías o compras…
            </p>
          ) : null}

          {previa && previa.motivo ? (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-bg)] p-4 text-base"
            >
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
              <div>
                <p className="font-semibold">No se puede eliminar.</p>
                <p className="mt-1">{previa.motivo}</p>
              </div>
            </div>
          ) : null}

          {sePuede ? (
            <div
              className={`flex gap-3 rounded-lg border p-4 text-base ${
                previa.ultima
                  ? "border-[var(--ok)] bg-[var(--ok-bg)]"
                  : "border-[var(--warn)] bg-[var(--warn-bg)]"
              }`}
            >
              <Hash className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="font-medium">{avisoDelNumero(previa)}</p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-base text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCerrar}
            disabled={pendiente}
            className="h-11 w-full text-base sm:w-auto"
          >
            {sePuede ? "Cancelar" : "Cerrar"}
          </Button>
          {sePuede ? (
            <Button
              type="button"
              variant="danger"
              onClick={confirmar}
              disabled={pendiente}
              className="h-11 w-full text-base sm:w-auto"
            >
              <Trash2 className="size-5" aria-hidden="true" />
              {pendiente ? "Eliminando…" : "Eliminar cotización"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
