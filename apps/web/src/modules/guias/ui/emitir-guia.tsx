"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, TriangleAlert } from "lucide-react";
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

import { emitirGuia } from "../acciones/emitir";
import { faltaParaEmitir } from "../dominio/emitir";
import { ETIQUETA_MODALIDAD, type GuiaDetalle } from "../dominio/tipos";

/**
 * Emitir la guía: el botón que **saca el stock del almacén**.
 *
 * Desde el 14/10 la ventana CONFIRMA lo que la guía ya dice, no vuelve a
 * pedirlo. Antes repetía el transporte en cajas sueltas —las mismas que Luis
 * pidió quitar del formulario (§BS)— y exigía placa siempre, así que una guía
 * «a pie» no se podía emitir. Lo que falte se completa con «Editar», que es
 * el mismo formulario con el que se preparó.
 *
 * Y dice EXPLÍCITAMENTE lo que va a pasar con el stock. Emitir no se deshace
 * con un botón: revertirlo es anular la guía, que es un movimiento en sentido
 * contrario y solo lo puede hacer gerencia.
 */
export function EmitirGuia({ guia }: { guia: GuiaDetalle }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, enviar] = React.useTransition();

  if (guia.estado !== "borrador") return null;

  const falta = faltaParaEmitir(guia);
  const transporte =
    guia.modalidad_traslado === "01"
      ? `${ETIQUETA_MODALIDAD["01"]} · ${guia.transportista_razon_social ?? "agencia"}${guia.transportista_documento ? ` (RUC ${guia.transportista_documento})` : ""}`
      : guia.a_pie
        ? `A pie · lo lleva ${guia.conductor_nombre ?? "—"}${guia.conductor_documento ? ` (DNI ${guia.conductor_documento})` : ""}`
        : `${ETIQUETA_MODALIDAD["02"]} · ${guia.transportista_placa ?? "sin placa"}${guia.conductor_nombre ? ` · ${guia.conductor_nombre}` : ""}`;

  const confirmar = () => {
    setError(null);
    enviar(async () => {
      const r = await emitirGuia(guia.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  };

  const Fila = ({ ok, etiqueta, valor }: { ok: boolean; etiqueta: string; valor: string }) => (
    <li className="flex items-start gap-2 py-1.5">
      {ok ? (
        <Check className="mt-0.5 size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
      ) : (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
      )}
      <span className="text-base">
        <span className="text-[var(--fg-muted)]">{etiqueta}:</span> {valor}
      </span>
    </li>
  );

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
        Emitir y despachar
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Emitir {guia.numero}</DialogTitle>
          <DialogDescription>
            Al emitir, <strong>{guia.lineas.length}</strong>{" "}
            {guia.lineas.length === 1 ? "producto sale" : "productos salen"} del almacén y el kardex registra la
            salida. Deshacerlo es anular la guía, y eso solo lo puede hacer Gerencia.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            <Fila
              ok={Boolean(guia.orden_compra_cliente?.trim())}
              etiqueta="Orden de compra del cliente"
              valor={guia.orden_compra_cliente?.trim() || "falta"}
            />
            <Fila
              ok={!falta.some((f) => /RUC|DNI|vehículo/.test(f))}
              etiqueta="Transporte"
              valor={transporte}
            />
            <Fila ok={guia.peso_bruto_kg > 0} etiqueta="Peso bruto" valor={`${guia.peso_bruto_kg} kg`} />
          </ul>

          {falta.length > 0 ? (
            <div className="mt-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
              <p>
                Antes de emitir falta <strong>{falta.join(", ")}</strong>.
              </p>
              <Link
                href={`/guias/${guia.id}/editar`}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Editar la guía
              </Link>
            </div>
          ) : null}

          {error ? (
            <p className="anim-entrada mt-3 rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={falta.length > 0 || enviando}>
            {enviando ? "Emitiendo…" : "Emitir y sacar del almacén"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
