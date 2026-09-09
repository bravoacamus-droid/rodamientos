"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatearMoneda,
} from "@rodatech/ui";
import { ShoppingCart } from "lucide-react";

import type { CompraPropuesta } from "../../dominio/comparador";
import { conIgv, TASA_IGV } from "../../dominio/igv";

/**
 * El último vistazo antes de que la ronda se convierta en compras.
 *
 * ---------------------------------------------------------------------------
 * Por qué hay un paso más
 * ---------------------------------------------------------------------------
 * Luis, 09/09: *«supuestamente, como yo estoy comprando, viene o no con IGV,
 * ¿no? Él me dirá»*. Y antes no había dónde decirlo: el sistema lo deducía del
 * tipo de proveedor —local con IGV, importación sin— y lo daba por hecho.
 *
 * Acierta casi siempre, pero no siempre: el proveedor local que emite boleta o
 * está en el RUS no carga IGV, y a su compra se le sumaba un 18 % que no
 * existe. Un 18 % de más en el costo es un margen que sale mal en todo lo que
 * se venda de ese lote.
 *
 * Y de paso resuelve lo otro que preguntó el mismo día —*«en cada orden voy a
 * poder ver el total a pagar, ¿no?»*—: registrar era un botón que hacía algo
 * irreversible sin enseñar antes cuánto era. Ahora se ve una fila por
 * proveedor, con su total, antes de pulsar.
 */
export function ConfirmarCompras({
  propuestas,
  enCurso,
  onConfirmar,
}: {
  propuestas: readonly CompraPropuesta[];
  enCurso: boolean;
  /** Por `consulta_proveedor_id`, si su comprobante lleva IGV. */
  onConfirmar: (afectos: Record<string, boolean>) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);

  /*
    El valor de siempre, y editable.

    Se recalcula al abrir y no en un `useState` inicial: entre que se carga la
    pantalla y se pulsa el botón se apuntan precios, y las propuestas cambian.
  */
  const [afectos, setAfectos] = React.useState<Record<string, boolean>>({});

  const abrir = () => {
    setAfectos(
      Object.fromEntries(
        propuestas.map((c) => [c.consulta_proveedor_id, c.tipo === "local"]),
      ),
    );
    setAbierto(true);
  };

  const totalDe = (c: CompraPropuesta) =>
    afectos[c.consulta_proveedor_id] ? conIgv(c.subtotal) : c.subtotal;

  const totalTodo = propuestas.reduce((suma, c) => suma + totalDe(c), 0);

  return (
    <>
      <Button onClick={abrir} disabled={enCurso} className="gap-1.5">
        <ShoppingCart className="size-4" aria-hidden="true" />
        {propuestas.length <= 1
          ? "Registrar la compra"
          : `Registrar ${propuestas.length} compras`}
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {propuestas.length === 1
                ? "Confirma la compra"
                : `Confirma las ${propuestas.length} compras`}
            </DialogTitle>
            <DialogDescription>
              Una por proveedor. Marca si su comprobante lleva IGV: es lo que él
              te diga, no lo que suponga el sistema.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {propuestas.map((c) => {
                const afecto = afectos[c.consulta_proveedor_id] ?? false;
                return (
                  <li key={c.consulta_proveedor_id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold" title={c.proveedor}>
                        {c.proveedor}
                      </span>
                      <span className="text-sm text-[var(--fg-muted)]">
                        {c.lineas.length}{" "}
                        {c.lineas.length === 1 ? "producto" : "productos"} ·{" "}
                        {c.tipo === "local" ? "Local" : "Importación"}
                      </span>
                    </div>

                    <label className="mt-2 flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={afecto}
                        onChange={() =>
                          setAfectos((previos) => ({
                            ...previos,
                            [c.consulta_proveedor_id]: !afecto,
                          }))
                        }
                        className="mt-1 size-4"
                      />
                      <span className="text-sm">
                        Su comprobante lleva IGV
                        <span className="block text-[var(--fg-muted)]">
                          {c.tipo === "importacion"
                            ? "Es una importación: el IGV se paga en aduana, no al proveedor."
                            : "Quítalo si te da boleta o está en el RUS."}
                        </span>
                      </span>
                    </label>

                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2">
                      <span className="text-sm text-[var(--fg-muted)]">
                        {formatearMoneda(c.subtotal, "USD")}
                        {afecto
                          ? ` + ${formatearMoneda(conIgv(c.subtotal) - c.subtotal, "USD")} de IGV`
                          : " · sin IGV"}
                      </span>
                      <strong className="text-lg tabular-nums">
                        {formatearMoneda(totalDe(c), "USD")}
                      </strong>
                    </div>
                  </li>
                );
              })}
            </ul>

            {propuestas.length > 1 ? (
              <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border)] pt-3">
                <span className="font-medium">Todo junto</span>
                <strong className="text-lg tabular-nums">
                  {formatearMoneda(totalTodo, "USD")}
                </strong>
              </p>
            ) : null}

            {/* El IGV de una compra en soles se calcula igual: la tasa no
                cambia con la moneda, y los totales de aquí se enseñan en USD
                porque es la moneda en la que se compara toda la ronda. */}
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              El IGV es el {Math.round(TASA_IGV * 100)} %. Después se puede
              corregir anulando la compra y volviéndola a registrar.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={enCurso}
              onClick={() => {
                onConfirmar(afectos);
                setAbierto(false);
              }}
              className="gap-1.5"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              {enCurso
                ? "Registrando…"
                : propuestas.length === 1
                  ? "Registrar la compra"
                  : `Registrar las ${propuestas.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
