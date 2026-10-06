"use client";

// En su propio archivo desde el 06/10: lo abre el listado de productos y,
// desde entonces, también la línea de una cotización («Actualizar stock» en
// «Más opciones»). Un solo diálogo, para que los dos cuadren igual.

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
  Input,
  Textarea,
} from "@rodatech/ui";

import { ajustarStock, type ResultadoStock } from "../acciones/stock";

/**
 * Cuadre de stock.
 *
 * Se pide **cuánto hay de verdad**, no cuánto sumar o restar: es lo que la
 * persona tiene delante después de contar. La diferencia la saca el servidor y
 * la registra como movimiento, así que el kardex sigue cuadrando.
 */
export function DialogoStock({
  abierto,
  cerrar,
  id,
  codigo,
  descripcion,
  stock,
  alGuardar,
}: {
  abierto: boolean;
  cerrar: () => void;
  id: string;
  codigo: string;
  descripcion: string;
  stock: number;
  /**
   * Quien lo abre desde una cotización recibe el saldo nuevo para ponerlo en
   * la línea al momento (06/10). Sin esto, refresca la página, que es lo que
   * le sirve al listado de productos.
   */
  alGuardar?: (nuevo: number) => void;
}) {
  const router = useRouter();
  const [contado, setContado] = React.useState(String(stock));
  const [motivo, setMotivo] = React.useState("");
  const [resultado, enviar, enviando] = React.useActionState<
    ResultadoStock | null,
    FormData
  >(async (previo, formData) => {
    const r = await ajustarStock(previo, formData);
    if (r.ok) {
      if (alGuardar) alGuardar(r.nuevo);
      else router.refresh();
      cerrar();
    }
    return r;
  }, null);

  // Al reabrirlo para otro producto, los campos tienen que empezar limpios.
  React.useEffect(() => {
    if (abierto) {
      setContado(String(stock));
      setMotivo("");
    }
  }, [abierto, stock]);

  const real = Number(contado.replace(",", "."));
  const diferencia = Number.isFinite(real)
    ? Number((real - stock).toFixed(2))
    : 0;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar stock</DialogTitle>
          <DialogDescription>
            {codigo} · {descripcion}
          </DialogDescription>
        </DialogHeader>

        {/* El pie va dentro del formulario: su botón es el que envía. */}
        <form action={enviar}>
          <DialogBody className="flex flex-col gap-3">
            <input
              type="hidden"
              name="ajuste"
              value={JSON.stringify({
                producto_id: id,
                cantidad_real: Number.isFinite(real) ? real : 0,
                motivo: motivo.trim(),
              })}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-[var(--fg-muted)]">
                  Sistema dice
                </span>
                <span className="tabular text-2xl font-semibold">{stock}</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Contaste</span>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  className="text-right tabular"
                  autoFocus
                />
              </label>
            </div>

            {diferencia !== 0 ? (
              <p className="rounded-sm bg-[var(--surface-2)] p-2.5 text-sm">
                Se registrará un ajuste de{" "}
                <strong
                  className={
                    diferencia > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                  }
                >
                  {diferencia > 0 ? "+" : ""}
                  {diferencia}
                </strong>{" "}
                unidades. Queda constancia en el kardex a tu nombre.
              </p>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                El conteo coincide con el saldo: no hay nada que ajustar.
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Motivo</span>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Conteo físico del 21/08, se encontraron 3 unidades más en el anaquel B."
              />
              <span className="text-sm text-[var(--fg-muted)]">
                Obligatorio. Un ajuste sin explicación es un descuadre que nadie
                va a poder auditar en tres meses.
              </span>
            </label>

            {resultado && !resultado.ok ? (
              <p className="text-sm text-[var(--danger)]">{resultado.error}</p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                enviando || diferencia === 0 || motivo.trim().length < 4
              }
            >
              {enviando ? "Registrando…" : "Registrar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
