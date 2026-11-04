"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, X } from "lucide-react";
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

import { anularGuia } from "../acciones/anular";
import { BotonAbrirSunat, PasosBajaSunat } from "./baja-sunat-guia";

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
  vivaEnSunat = false,
}: {
  /**
   * SUNAT la aceptó (190): anularla aquí no basta, hay que darla de baja en
   * SUNAT Operaciones en Línea. El diálogo lo dice antes y lo guía después.
   */
  vivaEnSunat?: boolean;
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
  /** Anulada y a la espera de la baja en SUNAT: el diálogo pasa al paso 2. */
  const [faltaBaja, setFaltaBaja] = React.useState(false);

  if (estado === "anulada" && !faltaBaja) return null;

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
      setMotivo("");
      // Willy, 04/11: su sistema anterior avisaba al anular que faltaba la
      // baja en SUNAT. Aquí, además, se dice cómo, sin cerrar el diálogo.
      if (r.pideBaja) {
        setFaltaBaja(true);
        return;
      }
      setAbierto(false);
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
          if (faltaBaja) {
            setFaltaBaja(false);
            router.refresh();
          }
        }
      }}
    >
      {/*
        Anular se ve, pero no invita.

        Luis, 09/09: *«mejora el botón de imprimir y anular, dale color»*. El
        borde era el gris de todos los demás, así que la acción que no se
        deshace se veía igual que «Corregir».

        Ahora lleva su color en el borde y un icono, pero se queda en contorno:
        rellenarlo de rojo lo pondría al nivel de la acción principal, y en una
        fila donde el botón azul es «Emitir y despachar», eso es exactamente lo
        que no se quiere.
      */}
      <DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--danger)] px-3 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)]">
        <X aria-hidden="true" className="size-[18px] shrink-0" />
        Anular
      </DialogTrigger>

      {faltaBaja ? (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Guía {numero} anulada en el sistema</DialogTitle>
            <DialogDescription>Falta un paso: darla de baja en SUNAT.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ol className="mt-3 flex flex-col gap-3 text-sm">
              <li className="flex items-start gap-2 rounded-md border border-[var(--ok)] bg-[var(--surface-2)] p-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                <span>
                  <strong>1. Anulada en el sistema.</strong> La mercadería volvió al almacén y queda el motivo.
                </span>
              </li>
              <li className="rounded-md border-2 border-[var(--warn)] bg-[var(--warn-bg)] p-3">
                <strong>2. Falta darla de baja en SUNAT.</strong> SUNAT la aceptó y para SUNAT sigue viva. Se
                hace en su página (o se lo pasas a tu contador):
                <PasosBajaSunat numero={numero} />
              </li>
            </ol>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              Hasta que lo marques, la guía dirá «Falta darla de baja en SUNAT» en su ficha y en la lista.
            </p>
          </DialogBody>
          <DialogFooter>
            <BotonAbrirSunat />
            <Button
              type="button"
              onClick={() => {
                setAbierto(false);
                setFaltaBaja(false);
                router.refresh();
              }}
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : (
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular la guía {numero}</DialogTitle>
          <DialogDescription>
            {estado === "emitida"
              ? "La mercadería vuelve al almacén y el kardex registra el ingreso. Queda todo trazado: la guía no se borra."
              : "El borrador queda anulado. No había salido stock, así que no hay nada que devolver."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {comprobante ? (
            <p className="mt-3 rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
              Hay un comprobante vigente contra esta guía (
              <strong>{comprobante.numero}</strong>). No se puede anular sin
              anular antes ese comprobante: la factura quedaría apuntando a un
              documento que dice que nunca existió.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {estado === "emitida" && vivaEnSunat ? (
                <p className="rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm">
                  <strong>Son dos pasos.</strong> Aquí se anula en el sistema. Como SUNAT ya la aceptó,
                  después hay que <strong>darla de baja en SUNAT</strong>: al anular te digo cómo.
                </p>
              ) : null}
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
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAbierto(false)}
          >
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
      )}
    </Dialog>
  );
}
