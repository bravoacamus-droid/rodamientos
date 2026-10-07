"use client";

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
  buttonVariants,
} from "@rodatech/ui";
import { Eye, FileUp, X } from "lucide-react";

import { enlaceVoucher, ponerVoucher } from "../acciones/voucher";

export const TIPOS_VOUCHER = "application/pdf,image/jpeg,image/png,image/webp,image/heic";

/**
 * El voucher de un pago ya registrado, en la lista de «Lo cobrado» (109).
 *
 * Con voucher: «Ver voucher», que lo abre aquí mismo —foto o PDF— como los
 * papeles del proveedor (068). Sin él: «Subir voucher», que abre el selector
 * de archivos y lo guarda al elegirlo, sin un segundo botón: el voucher suele
 * llegar por la tarde, después de haber registrado el pago.
 */
export function VoucherDelPago({
  pagoId,
  tiene,
  puedeSubir,
}: {
  pagoId: string;
  tiene: boolean;
  puedeSubir: boolean;
}) {
  const router = useRouter();
  const entrada = React.useRef<HTMLInputElement>(null);
  const [enCurso, empezar] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [mirando, setMirando] = React.useState<{ url: string; nombre: string; esPdf: boolean } | null>(
    null,
  );

  function ver() {
    setError(null);
    empezar(async () => {
      const r = await enlaceVoucher(pagoId);
      if (!r.ok) setError(r.error);
      else setMirando({ url: r.url, nombre: r.nombre, esPdf: r.esPdf });
    });
  }

  function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    const datos = new FormData();
    datos.set("pago_id", pagoId);
    datos.set("archivo", archivo);
    empezar(async () => {
      const r = await ponerVoucher(datos);
      if (entrada.current) entrada.current.value = "";
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMirando(null);
      router.refresh();
    });
  }

  if (!tiene && !puedeSubir) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_VOUCHER}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => subir(e.target.files?.[0])}
      />
      {tiene ? (
        <Button type="button" variant="outline" size="sm" disabled={enCurso} onClick={ver} className="gap-1.5">
          <Eye className="size-4" aria-hidden="true" />
          {enCurso ? "Abriendo…" : "Ver voucher"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enCurso}
          onClick={() => entrada.current?.click()}
          className="gap-1.5"
        >
          <FileUp className="size-4" aria-hidden="true" />
          {enCurso ? "Subiendo…" : "Subir voucher"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <Dialog open={mirando !== null} onOpenChange={(v) => (v ? null : setMirando(null))}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Voucher del pago</DialogTitle>
            <DialogDescription>{mirando?.nombre}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {mirando ? (
              mirando.esPdf ? (
                <iframe
                  src={mirando.url}
                  title={mirando.nombre}
                  className="h-[70vh] w-full rounded-md border border-[var(--border)]"
                />
              ) : (
                // Una foto de celular viene enorme: se encaja, no se recorta.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mirando.url}
                  alt={mirando.nombre}
                  className="mx-auto max-h-[70vh] w-auto rounded-md border border-[var(--border)] object-contain"
                />
              )
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMirando(null)}>
              <X className="size-4" aria-hidden="true" />
              Cerrar
            </Button>
            {puedeSubir ? (
              <Button
                type="button"
                variant="outline"
                disabled={enCurso}
                onClick={() => entrada.current?.click()}
              >
                <FileUp className="size-4" aria-hidden="true" />
                {enCurso ? "Subiendo…" : "Cambiar por otro"}
              </Button>
            ) : null}
            {mirando ? (
              <a href={mirando.url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
                Abrir aparte o descargar
              </a>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
