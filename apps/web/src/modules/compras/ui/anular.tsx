"use client";

// Cliente: es un diálogo con estado propio y llama a una Server Action.

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
  DialogTrigger,
  Textarea,
} from "@rodatech/ui";

import { anularCompra } from "../acciones/anular";

/**
 * Anular una compra.
 *
 * El motivo es obligatorio y de al menos cinco caracteres. No es burocracia:
 * un documento anulado sin motivo es un agujero en la auditoría — dentro de
 * seis meses nadie recuerda si fue un error de tecleo o que el proveedor no
 * sirvió.
 *
 * Si ya entró mercadería, `anular_compra()` se niega y el mensaje lo explica.
 * Es lo correcto: anularla dejaría el kardex apuntando a un documento que dice
 * que nunca existió, con el stock todavía en la estantería.
 */
export function AnularCompra({
  id,
  numero,
  recibida,
}: {
  id: string;
  numero: string;
  /** Si ya llegó algo, el botón ni se ofrece. */
  recibida: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, enviar] = React.useTransition();

  if (recibida) return null;

  const confirmar = () => {
    setError(null);
    enviar(async () => {
      const datos = new FormData();
      datos.set("id", id);
      datos.set("motivo", motivo);

      const r = await anularCompra(null, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) {
          setMotivo("");
          setError(null);
        }
      }}
    >
      <DialogTrigger className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]">
        Anular
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular la compra {numero}</DialogTitle>
          <DialogDescription>
            La compra queda registrada como anulada, con su motivo. No se borra:
            el número ya está usado y el histórico tiene que poder explicarlo.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Motivo <span className="text-[var(--danger)]">*</span>
              </span>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Por ejemplo: el proveedor no tenía stock y se compró a otro."
                autoFocus
              />
            </label>

            {error ? (
              <p className="rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAbierto(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={motivo.trim().length < 5 || enviando}
          >
            {enviando ? "Anulando…" : "Anular compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
