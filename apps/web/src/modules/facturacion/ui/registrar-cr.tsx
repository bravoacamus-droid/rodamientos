"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, FileUp } from "lucide-react";
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
  Input,
  formatearFecha,
} from "@rodatech/ui";

import { enlaceCr, registrarCr } from "../acciones/cr";

export interface CrRegistrado {
  nombre: string;
  numero_cr: string | null;
  subido_en: string;
}

/**
 * «Registrar CR» (Willy, 14/10): el comprobante de retención, colgado de su
 * factura. Solo sale en las facturas con retención.
 *
 * `compacto`: solo los botones, para la fila de Cobranzas (31/10), donde el
 * estado ya lo dice la insignia de al lado.
 */
export function RegistrarCr({
  comprobanteId,
  numero,
  cr,
  puede,
  compacto = false,
}: {
  comprobanteId: string;
  numero: string;
  cr: CrRegistrado | null;
  puede: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, iniciar] = React.useTransition();
  const [abriendo, iniciarAbrir] = React.useTransition();

  const ver = () =>
    iniciarAbrir(async () => {
      const r = await enlaceCr(comprobanteId);
      if (r.ok) window.open(r.url, "_blank", "noopener");
      else setError(r.error);
    });

  return (
    <div
      className={
        compacto
          ? "text-sm"
          : `rounded-sm border p-2.5 text-sm ${cr ? "border-[var(--ok)] bg-[var(--surface-2)]" : "border-[var(--warn)] bg-[var(--warn-bg)]"}`
      }
    >
      {compacto ? null : cr ? (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <FileCheck2 className="size-4 text-[var(--ok)]" aria-hidden="true" />
            CR registrado{cr.numero_cr ? ` · ${cr.numero_cr}` : ""}
          </p>
          <p className="mt-0.5 text-[var(--fg-muted)]">
            {cr.nombre} · {formatearFecha(cr.subido_en)}
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">Falta el comprobante de retención (CR)</p>
          <p className="mt-0.5 text-[var(--fg-muted)]">
            Súbelo cuando llegue: sin él, lo retenido no se recupera.
          </p>
        </>
      )}

      <div className={`flex flex-wrap gap-2 ${compacto ? "" : "mt-2"}`}>
        {cr ? (
          <Button type="button" variant="outline" size="sm" onClick={ver} disabled={abriendo}>
            {abriendo ? "Abriendo…" : "Ver CR"}
          </Button>
        ) : null}
        {puede ? (
          <Dialog
            open={abierto}
            onOpenChange={(v) => {
              setAbierto(v);
              if (!v) setError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant={cr ? "outline" : "primary"} size="sm">
                <FileUp className="size-4" aria-hidden="true" />
                {cr ? "Cambiar CR" : "Registrar CR"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Comprobante de retención de {numero}</DialogTitle>
                <DialogDescription>
                  El PDF que te mandó el cliente. El mismo archivo no se puede cargar en dos facturas.
                </DialogDescription>
              </DialogHeader>
              <form
                action={(fd) =>
                  iniciar(async () => {
                    setError(null);
                    fd.set("comprobante_id", comprobanteId);
                    const r = await registrarCr(fd);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    setAbierto(false);
                    router.refresh();
                  })
                }
              >
                <DialogBody className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Archivo <span className="text-[var(--danger)]">*</span>
                    </span>
                    <input
                      type="file"
                      name="archivo"
                      required
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border-strong)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Número del CR (si lo trae)</span>
                    <Input name="numero_cr" maxLength={40} placeholder="E001-1234" />
                  </label>
                  {error ? (
                    <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                      {error}
                    </p>
                  ) : null}
                </DialogBody>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={enviando}>
                    {enviando ? "Subiendo…" : "Guardar CR"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      {error && !abierto ? <p className="mt-1 text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
