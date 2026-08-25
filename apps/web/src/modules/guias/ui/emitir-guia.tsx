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
  Input,
  SelectNativo,
} from "@rodatech/ui";

import { emitirGuia } from "../acciones/emitir";
import { ETIQUETA_MODALIDAD, type GuiaDetalle, type ModalidadTraslado } from "../dominio/tipos";

/**
 * Emitir la guía: el botón que **saca el stock del almacén**.
 *
 * Se completa aquí lo que faltaba del transporte, porque es el momento en que
 * se sabe: la guía se preparó al cerrar la venta y el camión aparece después.
 * Es la separación que pidió Willy (§2.2) y la misma que hace la base con
 * `guia_transporte_ok`.
 *
 * El diálogo dice EXPLÍCITAMENTE lo que va a pasar con el stock. Emitir no se
 * deshace con un botón: revertirlo es anular la guía, que es un movimiento en
 * sentido contrario y solo lo puede hacer gerencia.
 */
export function EmitirGuia({ guia }: { guia: GuiaDetalle }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, enviar] = React.useTransition();

  const [modalidad, setModalidad] = React.useState<ModalidadTraslado>(
    guia.modalidad_traslado,
  );
  const [documento, setDocumento] = React.useState(guia.transportista_documento ?? "");
  const [razonSocial, setRazonSocial] = React.useState(
    guia.transportista_razon_social ?? "",
  );
  const [placa, setPlaca] = React.useState(guia.transportista_placa ?? "");
  const [conductor, setConductor] = React.useState(guia.conductor_nombre ?? "");
  const [dni, setDni] = React.useState(guia.conductor_documento ?? "");
  const [licencia, setLicencia] = React.useState(guia.conductor_licencia ?? "");

  if (guia.estado !== "borrador") return null;

  const esPublico = modalidad === "01";
  const listo = esPublico ? documento.trim().length === 11 : placa.trim().length >= 6;

  const confirmar = () => {
    setError(null);
    enviar(async () => {
      const datos = new FormData();
      datos.set(
        "transporte",
        JSON.stringify({
          id: guia.id,
          modalidad_traslado: modalidad,
          transportista_documento: esPublico ? documento.trim() || null : null,
          transportista_razon_social: esPublico ? razonSocial.trim() || null : null,
          transportista_placa: esPublico ? null : placa.trim() || null,
          conductor_documento: dni.trim() || null,
          conductor_nombre: conductor.trim() || null,
          conductor_licencia: licencia.trim() || null,
        }),
      );

      const r = await emitirGuia(null, datos);
      if (!r.ok) {
        setError(r.error);
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
        if (!v) setError(null);
      }}
    >
      <DialogTrigger className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
        Emitir y despachar
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogTitle>Emitir {guia.numero}</DialogTitle>
        <DialogDescription>
          Al emitir, <strong>{guia.lineas.length}</strong>{" "}
          {guia.lineas.length === 1 ? "producto sale" : "productos salen"} del almacén y
          el kardex registra la salida. Deshacerlo es anular la guía, y eso solo lo puede
          hacer Gerencia.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Modalidad</span>
            <SelectNativo
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as ModalidadTraslado)}
            >
              {(["02", "01"] as ModalidadTraslado[]).map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MODALIDAD[m]}
                </option>
              ))}
            </SelectNativo>
          </label>

          {esPublico ? (
            <div className="anim-entrada grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  RUC <span className="text-[var(--danger)]">*</span>
                </span>
                <Input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  className="tabular"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Transportista</span>
                <Input
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className="anim-entrada flex flex-col gap-1">
              <span className="text-sm font-medium">
                Placa del vehículo <span className="text-[var(--danger)]">*</span>
              </span>
              <Input
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                placeholder="ABC-123"
                className="w-40 font-mono"
                autoFocus
              />
            </label>
          )}

          <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-soft)] pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Conductor</span>
              <Input value={conductor} onChange={(e) => setConductor(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">DNI</span>
              <Input
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="tabular"
                inputMode="numeric"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Licencia</span>
              <Input
                value={licencia}
                onChange={(e) => setLicencia(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </label>
          </div>

          {error ? (
            <p className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={!listo || enviando}>
            {enviando ? "Emitiendo…" : "Emitir y sacar del almacén"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
