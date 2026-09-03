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

import { registrarCobro, type ResultadoCobro } from "../acciones/cobrar";
import { cuotasDelComprobante } from "../acciones/gestionar";
import {
  avisosPago,
  bloqueosPago,
  quedaSaldado,
  repartoEnCuotas,
} from "../dominio/cobro";
import {
  ETIQUETA_MEDIO,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type MedioPago,
} from "../dominio/tipos";

/**
 * Registrar el cobro de un documento.
 *
 * El importe arranca en el SALDO, no en cero: lo normal es que el cliente
 * pague lo que debe, y pedir que lo teclee cada vez es pedirle que se
 * equivoque.
 *
 * Enseña el reparto sobre las cuotas antes de confirmar. No es adorno: es lo
 * que el cobrador le va a decir al cliente por teléfono —«con esto te queda
 * cerrada la primera y la segunda a la mitad»— y calcularlo de cabeza mientras
 * hablas es como se cuelan los errores.
 */
export function Cobrador({
  documento,
  hoy,
}: {
  documento: DocumentoPorCobrar;
  /** La fecha la fija el servidor: el dominio no lee reloj. */
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  const [monto, setMonto] = React.useState(documento.saldo);
  const [medio, setMedio] = React.useState<MedioPago>("transferencia");
  const [fecha, setFecha] = React.useState(hoy);
  const [referencia, setReferencia] = React.useState("");
  const [observaciones, setObservaciones] = React.useState("");
  const [cuotas, setCuotas] = React.useState<CuotaComprobante[]>([]);

  const [resultado, cobrar, cobrando] = useActionState<
    ResultadoCobro | null,
    FormData
  >(async (previo, formData) => {
    const r = await registrarCobro(previo, formData);
    if (r.ok) {
      setAbierto(false);
      router.refresh();
    }
    return r;
  }, null);

  // Las cuotas se piden al abrir, no al montar: la mayoría de las filas de la
  // cartera no se van a cobrar en esta sesión.
  React.useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void cuotasDelComprobante(documento.id).then((r) => {
      if (vigente && r.ok) setCuotas(r.datos);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, documento.id]);

  const bloqueos = bloqueosPago(documento, monto, fecha);
  const avisos = avisosPago(documento, monto, medio, fecha, hoy);
  const salda = quedaSaldado(documento.saldo, monto);
  const reparto = cuotas.length > 1 ? repartoEnCuotas(cuotas, monto) : [];

  const payload = JSON.stringify({
    pagos: [
      {
        comprobante_id: documento.id,
        fecha,
        monto,
        medio,
        referencia: referencia.trim() || null,
        observaciones: observaciones.trim() || null,
      },
    ],
  });

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) {
          // Al reabrir se vuelve al saldo vigente: si ya se cobró algo, el
          // importe de antes ya no vale.
          setMonto(documento.saldo);
          setFecha(hoy);
        }
      }}
    >
      <DialogTrigger className="inline-flex h-8 items-center rounded-sm bg-brand-600 px-2.5 text-xs font-medium text-white hover:bg-brand-700">
        Cobrar
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobrar {documento.numero}</DialogTitle>
          <DialogDescription>
            {documento.cliente} · saldo{" "}
            <strong>$ {documento.saldo.toFixed(2)}</strong>
            {documento.dias_vencido > 0
              ? ` · vencido hace ${documento.dias_vencido} días`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va DENTRO del formulario: su botón es el que envía. Por eso
            el cuerpo se envuelve aparte y no el formulario entero. */}
        <form action={cobrar}>
          <DialogBody className="flex flex-col gap-3">
            <input type="hidden" name="cobro" value={payload} />

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Importe <span className="text-[var(--danger)]">*</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="tabular"
                  autoFocus
                />
                {/* Atajo para el caso normal: el cliente paga lo que debe. */}
                {!salda ? (
                  <button
                    type="button"
                    onClick={() => setMonto(documento.saldo)}
                    className="self-start text-xs text-brand-600 underline underline-offset-2"
                  >
                    Cobrar el saldo completo
                  </button>
                ) : (
                  <span className="text-xs text-[var(--ok)]">
                    Queda saldado.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Medio</span>
                <SelectNativo
                  value={medio}
                  onChange={(e) => setMedio(e.target.value as MedioPago)}
                >
                  {Object.entries(ETIQUETA_MEDIO).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </SelectNativo>
              </label>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Referencia</span>
                <Input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="N.º de operación, cheque o depósito"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
              />
            </label>

            {/* El reparto sobre las cuotas: lo que el cobrador le va a decir al
              cliente. Solo se enseña si hay más de una; con una sola no aporta. */}
            {reparto.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1 text-xs font-medium">Cómo se reparte</p>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {reparto.map((r) => (
                    <li key={r.cuota.id} className="flex justify-between gap-2">
                      <span className="text-[var(--fg-muted)]">
                        Cuota {r.cuota.numero} · vence{" "}
                        {r.cuota.fecha_vencimiento}
                      </span>
                      <span className="tabular">
                        {r.aplica > 0 ? `+${r.aplica.toFixed(2)}` : "—"}
                        <span
                          className={`ml-2 ${r.quedaSaldo === 0 ? "text-[var(--ok)]" : "text-[var(--fg-muted)]"}`}
                        >
                          {r.quedaSaldo === 0
                            ? "saldada"
                            : `quedan ${r.quedaSaldo.toFixed(2)}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {avisos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-xs">
                  {avisos.map((a) => (
                    <li key={a.clave}>· {a.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {bloqueos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-xs text-[var(--danger)]">
                  {bloqueos.map((b) => (
                    <li key={b.campo}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
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
            <Button type="submit" disabled={bloqueos.length > 0 || cobrando}>
              {cobrando ? "Registrando…" : `Registrar $ ${monto.toFixed(2)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
