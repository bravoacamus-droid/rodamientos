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
  Moneda,
  SelectNativo,
  Textarea,
  buttonVariants,
  cn,
} from "@rodatech/ui";

import { emitirNota, type ResultadoNota } from "../acciones/nota";
import {
  avisosNota,
  bloqueosNota,
  esCorreccionSinImporte,
  esMotivoTotal,
  serieDeNota,
  totalDeNota,
  type TipoNota,
} from "../dominio/nota";
import type { ComprobanteDetalle } from "../dominio/tipos";
import { sinEnvioConEnter } from "@/lib/formularios";

/**
 * Emitir una nota de crédito o de débito sobre un comprobante.
 *
 * Es la única forma de corregir una factura emitida: no se edita, se corrige
 * con otro documento que tiene su propio correlativo.
 *
 * Tres cosas que la pantalla decide sola porque no son del operador:
 *
 *  · **La serie.** Sale del tipo del documento afectado. Una nota sobre boleta
 *    va en serie B, y cruzarla es un rechazo con el correlativo ya gastado.
 *  · **El importe con los motivos totales.** «Anulación» va por el total
 *    pendiente, no por una parte.
 *  · **Qué líneas lleva.** Con motivo total espeja el documento; con uno
 *    parcial va una sola línea con el concepto, porque repartir una rebaja
 *    entre las líneas originales lo decide quien negocia, no el sistema.
 */
export function EmisorNota({
  documento,
  motivos,
  hoy,
  yaAcreditado,
}: {
  documento: ComprobanteDetalle;
  /** El catálogo, ya filtrado por tipo. */
  motivos: { codigo: string; descripcion: string; tipo: string }[];
  hoy: string;
  /** Lo que otras notas de crédito ya acreditaron sobre este documento. */
  yaAcreditado: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  const [tipo, setTipo] = React.useState<TipoNota>("nota_credito");
  const [motivo, setMotivo] = React.useState("");
  const [fecha, setFecha] = React.useState(hoy);
  const [monto, setMonto] = React.useState(0);
  const [concepto, setConcepto] = React.useState("");
  const [observaciones, setObservaciones] = React.useState("");

  const [resultado, emitir, emitiendo] = useActionState<
    ResultadoNota | null,
    FormData
  >(async (previo, formData) => {
    const r = await emitirNota(previo, formData);
    if (r.ok) {
      setAbierto(false);
      router.push(`/facturacion/${r.id}`);
    }
    return r;
  }, null);

  const disponible = Math.round((documento.total - yaAcreditado) * 100) / 100;
  const delTipo = motivos.filter((m) => m.tipo === tipo);
  const total = esMotivoTotal(motivo);
  const importeFijo = total || esCorreccionSinImporte(motivo);

  // Con un motivo total el importe no se elige: es el pendiente de acreditar.
  React.useEffect(() => {
    if (total || esCorreccionSinImporte(motivo)) setMonto(disponible);
  }, [motivo, total, disponible]);

  const bloqueos = bloqueosNota(
    documento,
    tipo,
    motivo,
    monto,
    fecha,
    yaAcreditado,
  );
  const avisos = avisosNota(documento, tipo, motivo, monto);
  const serie = serieDeNota(documento.tipo, tipo);
  const totalReal = totalDeNota(monto);

  const payload = JSON.stringify({
    referencia_id: documento.id,
    tipo,
    motivo_codigo: motivo,
    fecha_emision: fecha,
    monto,
    concepto: concepto.trim(),
    observaciones: observaciones.trim() || null,
  });

  if (documento.tipo !== "factura" && documento.tipo !== "boleta") return null;
  if (documento.estado === "anulado") return null;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) setFecha(hoy);
      }}
    >
      {/* El mismo botón que «Imprimir» a su lado (revisión por módulos del
          02/10): eran dos bordes y dos radios distintos en la misma fila. */}
      <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
        Emitir nota
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nota sobre {documento.numero}</DialogTitle>
          <DialogDescription>
            {documento.cliente} · total <Dolares valor={documento.total} />
            {yaAcreditado > 0 ? (
              <>
                {" "}· ya acreditados <Dolares valor={yaAcreditado} />, quedan{" "}
                <Dolares valor={disponible} />
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va dentro del formulario: su botón es el que emite. */}
        <form action={emitir} onKeyDown={sinEnvioConEnter}>
          <DialogBody className="flex flex-col gap-3">
            <input type="hidden" name="nota" value={payload} />

            {/* Uno debajo de otro en el teléfono: a 390 px el desplegable se
                cortaba en «Nota de crédito» y no se leía qué hace cada una
                (revisión por módulos del 02/10). */}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tipo</span>
                <SelectNativo
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoNota);
                    // El motivo pertenece a un catálogo distinto por tipo: al
                    // cambiar, el anterior deja de existir.
                    setMotivo("");
                  }}
                >
                  <option value="nota_credito">Nota de crédito — reduce</option>
                  <option value="nota_debito">Nota de débito — aumenta</option>
                </SelectNativo>
                <span className="text-sm text-[var(--fg-muted)]">
                  Se emitirá con la serie{" "}
                  <strong className="font-mono font-semibold text-[var(--fg)]">{serie}</strong>
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Fecha</span>
                <Input
                  type="date"
                  min={documento.fecha_emision}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Motivo <span className="text-[var(--danger)]">*</span>
              </span>
              <SelectNativo
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                <option value="">Elige el motivo…</option>
                {delTipo.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.codigo} · {m.descripcion}
                  </option>
                ))}
              </SelectNativo>
            </label>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
              {/*
                Con un motivo total el importe no se elige, y en vez de una
                casilla gris deshabilitada —que parece rota— se escribe la
                cifra con su porqué (revisión por módulos del 02/10).
              */}
              {importeFijo ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Importe con IGV</span>
                  <Dolares valor={monto} className="text-lg font-semibold" />
                  <span className="text-sm text-[var(--fg-muted)]">
                    {total
                      ? "Con este motivo va por el total pendiente."
                      : "Con este motivo se copia el documento entero."}
                  </span>
                </div>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Importe con IGV{" "}
                    <span className="text-[var(--danger)]">*</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(Number(e.target.value))}
                    className="tabular"
                  />
                </label>
              )}

              {/* El total real puede desviarse un céntimo del importe tecleado:
                la base tiene cuatro decimales y el IGV se calcula sobre ella
                ya redondeada. Se enseña para que nadie teclee un número y vea
                otro en el documento. */}
              {monto > 0 && Math.abs(totalReal - monto) >= 0.01 ? (
                <div className="anim-entrada self-end rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm">
                  Saldrá por{" "}
                  <strong>
                    <Dolares valor={totalReal} />
                  </strong>
                  , no <Dolares valor={monto} />: el IGV se calcula sobre la
                  base redondeada.
                </div>
              ) : null}
            </div>

            {!importeFijo ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Concepto</span>
                <Input
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Descuento comercial acordado"
                />
                <span className="text-sm text-[var(--fg-subtle)]">
                  Es lo que sale impreso en la única línea de la nota.
                </span>
              </label>
            ) : (
              <p className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-sm">
                La nota copiará las <strong>{documento.lineas.length}</strong>{" "}
                {documento.lineas.length === 1 ? "línea" : "líneas"} del
                documento original: con este motivo se está corrigiendo la
                operación entera.
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observaciones</span>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
              />
            </label>

            {avisos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5">
                <ul className="flex flex-col gap-1 text-sm">
                  {avisos.map((a) => (
                    <li key={a.clave}>· {a.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {motivo && bloqueos.length > 0 ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5">
                <p className="mb-1 text-sm font-medium text-[var(--danger)]">
                  SUNAT lo rechazaría:
                </p>
                <ul className="flex flex-col gap-1 text-sm text-[var(--danger)]">
                  {bloqueos.map((b, i) => (
                    <li key={`${b.campo}-${i}`}>· {b.mensaje}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {resultado && !resultado.ok ? (
              <div className="anim-entrada rounded-sm border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                <p className="font-medium">{resultado.error}</p>
                {resultado.bloqueos ? (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {resultado.bloqueos.map((b) => (
                      <li key={b}>· {b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
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
            <Button
              type="submit"
              disabled={!motivo || bloqueos.length > 0 || emitiendo}
            >
              {emitiendo ? "Emitiendo…" : `Emitir ${serie}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Una cifra en dólares dentro de una frase, con su «$».
 *
 * Revisión por módulos del 02/10: el diálogo decía «total 2098.48» y «ya
 * acreditados 300.00», sin moneda. `Moneda` además no parte el signo de la
 * cifra. Hereda el color de la frase en la que va.
 */
function Dolares({ valor, className = "" }: { valor: number; className?: string }) {
  return <Moneda valor={valor} tamano="sm" className={`text-inherit ${className}`} />;
}
