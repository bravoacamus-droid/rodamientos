"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Textarea,
} from "@rodatech/ui";

import { anularGuia } from "../acciones/anular";

/**
 * Anular una guía emitida: **devuelve al almacén lo que sacó**.
 *
 * Solo gerencia, porque `anular_guia()` exige `es_gerencia()`. Y tiene
 * sentido: no es corregir un dato, es un movimiento de stock en sentido
 * contrario.
 *
 * La función se niega si hay un comprobante vigente contra esta guía. El
 * diálogo lo dice antes de dejar pulsar, para no gastar el intento.
 */
export function AnularGuia({
  id,
  numero,
  estado,
  comprobante,
}: {
  id: string;
  numero: string;
  estado: string;
  /** Si hay comprobante vigente, primero hay que anularlo a él. */
  comprobante: { id: string; numero: string } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, enviar] = React.useTransition();

  if (estado === "anulada") return null;

  const confirmar = () => {
    setError(null);
    enviar(async () => {
      const datos = new FormData();
      datos.set("id", id);
      datos.set("motivo", motivo);

      const r = await anularGuia(null, datos);
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
        <DialogTitle>Anular la guía {numero}</DialogTitle>
        <DialogDescription>
          {estado === "emitida"
            ? "La mercadería vuelve al almacén y el kardex registra el ingreso. Queda todo trazado: la guía no se borra."
            : "El borrador queda anulado. No había salido stock, así que no hay nada que devolver."}
        </DialogDescription>

        {comprobante ? (
          <p className="mt-3 rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
            Hay un comprobante vigente contra esta guía (<strong>{comprobante.numero}</strong>).
            No se puede anular sin anular antes ese comprobante: la factura quedaría
            apuntando a un documento que dice que nunca existió.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Motivo <span className="text-[var(--danger)]">*</span>
              </span>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Por ejemplo: el cliente rechazó la entrega y volvió todo."
                autoFocus
              />
            </label>

            {error ? (
              <p className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          {!comprobante ? (
            <Button
              type="button"
              onClick={confirmar}
              disabled={motivo.trim().length < 5 || enviando}
            >
              {enviando ? "Anulando…" : "Anular guía"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
