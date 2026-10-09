"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rodatech/ui";

import { ponerOrdenCliente } from "../../acciones/gestionar";

/**
 * Poner o cambiar la orden de compra del cliente desde la ficha (09/10).
 * Ya no se escribe al cotizar: llega cuando el cliente la manda.
 */
export function OrdenCliente({ cotizacionId, actual }: { cotizacionId: string; actual: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [valor, setValor] = React.useState(actual ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, empezar] = React.useTransition();

  const guardar = () =>
    empezar(async () => {
      const r = await ponerOrdenCliente(cotizacionId, valor);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        setValor(actual ?? "");
        setError(null);
      }}
    >
      <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setAbierto(true)}>
        <Pencil className="size-4" aria-hidden="true" />
        {actual ? "Cambiar" : "Poner orden"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orden de compra del cliente</DialogTitle>
          <DialogDescription>El número que viene en la orden que mandó el cliente.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2">
          <Input value={valor} maxLength={60} autoFocus onChange={(e) => setValor(e.target.value)} placeholder="Ej. 4500123456" />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
