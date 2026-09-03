"use client";

import * as React from "react";
import { useActionState } from "react";
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
  Input,
  SelectNativo,
  Textarea,
} from "@rodatech/ui";

import { registrarGestion, type ResultadoGestion } from "../acciones/gestionar";
import {
  CANALES,
  ETIQUETA_CANAL,
  type DocumentoPorCobrar,
} from "../dominio/tipos";

/**
 * Apuntar una gestión de cobranza.
 *
 * Lo que de verdad importa aquí es el **compromiso**: alguien dijo que pagaba
 * tal día. Sin apuntarlo, la promesa se olvida y la gestión se pierde — que es
 * exactamente lo que pasa cuando el seguimiento vive en la cabeza del que
 * llamó.
 *
 * Por eso el campo de compromiso está arriba y no escondido al final, y por eso
 * la acción se niega a guardar una gestión que no dice ni qué pasó ni para
 * cuándo quedaron.
 */
export function Gestor({
  documento,
  hoy,
}: {
  documento: DocumentoPorCobrar;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  const [canal, setCanal] = React.useState<string>("whatsapp");
  const [compromiso, setCompromiso] = React.useState("");
  const [resultadoTexto, setResultadoTexto] = React.useState("");
  const [nota, setNota] = React.useState("");

  const [resultado, guardar, guardando] = useActionState<
    ResultadoGestion | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarGestion(previo, formData);
    if (r.ok) {
      setAbierto(false);
      setNota("");
      setCompromiso("");
      setResultadoTexto("");
      router.refresh();
    }
    return r;
  }, null);

  const payload = JSON.stringify({
    cliente_id: documento.cliente_id,
    comprobante_id: documento.id,
    canal,
    resultado: resultadoTexto.trim() || null,
    compromiso_fecha: compromiso || null,
    nota: nota.trim() || null,
  });

  const sinContenido = !nota.trim() && !compromiso;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className="inline-flex h-8 items-center rounded-sm border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface-2)]">
        Anotar
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gestión sobre {documento.numero}</DialogTitle>
          <DialogDescription>
            {documento.cliente} · deben $ {documento.saldo.toFixed(2)}
            {documento.dias_vencido > 0
              ? ` desde hace ${documento.dias_vencido} días`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va dentro del formulario: su botón es el que envía. */}
        <form action={guardar}>
          <DialogBody className="flex flex-col gap-3">
            <input type="hidden" name="gestion" value={payload} />

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Canal</span>
                <SelectNativo
                  value={canal}
                  onChange={(e) => setCanal(e.target.value)}
                >
                  {CANALES.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CANAL[c] ?? c}
                    </option>
                  ))}
                </SelectNativo>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">¿Pagará el…?</span>
                <Input
                  type="date"
                  min={hoy}
                  value={compromiso}
                  onChange={(e) => setCompromiso(e.target.value)}
                />
                <span className="text-xs text-[var(--fg-subtle)]">
                  Si se comprometió a una fecha, apúntala: sale sola en la lista
                  del día que llegue.
                </span>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Resultado</span>
              <Input
                value={resultadoTexto}
                onChange={(e) => setResultadoTexto(e.target.value)}
                placeholder="Promete pagar · No contesta · Pide reprogramar"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Qué dijo</span>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Con quién se habló y qué quedó."
              />
            </label>

            {sinContenido ? (
              <p className="text-xs text-[var(--fg-muted)]">
                Apunta al menos qué dijo el cliente, o para cuándo se
                comprometió: una gestión vacía solo dice que alguien llamó.
              </p>
            ) : null}

            {resultado && !resultado.ok ? (
              <p className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {resultado.error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={sinContenido || guardando}>
              {guardando ? "Guardando…" : "Guardar gestión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
