"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
} from "@rodatech/ui";

import { borrarBorradorFactura } from "../acciones/borrador";

/**
 * Borrar una factura en borrador (176), con un diálogo que pregunta: no
 * gasta nada —no tiene número—, pero lo llenado se pierde.
 */
export function BorrarBorrador({ id, cliente }: { id: string; cliente: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [borrando, iniciar] = React.useTransition();

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Trash2 className="size-4" aria-hidden="true" />
          Borrar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Borrar el borrador de {cliente}?</DialogTitle>
          <DialogDescription>
            No tiene número, así que no se pierde ningún correlativo. Lo que se llenó, sí.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={borrando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={borrando}
            onClick={() =>
              iniciar(async () => {
                const r = await borrarBorradorFactura(id);
                if (!r.ok) return setError(r.error);
                setAbierto(false);
                router.refresh();
              })
            }
          >
            {borrando ? "Borrando…" : "Sí, borrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
