"use client";

// Cliente: consulta el tipo de cambio a SUNAT al vuelo y escribe en el estado
// del constructor. Las dos cosas son eventos del navegador.

import * as React from "react";
import { Button, Input, SelectNativo } from "@rodatech/ui";
import { Download } from "lucide-react";

import { tipoCambioDelDia } from "../../acciones/tipo-cambio";
import {
  ETIQUETA_MONEDA,
  SIMBOLO_MONEDA,
  type Accion,
  type Moneda,
} from "../../dominio/constructor";

/**
 * En qué moneda vino la factura del proveedor.
 *
 * ---------------------------------------------------------------------------
 * El fallo que esto evita
 * ---------------------------------------------------------------------------
 * Todo el sistema vende y valoriza en dólares —está así desde la primera
 * migración, y es correcto: Willy cotiza y factura en USD—. Pero él compra
 * local (01/09, 28:05) y en Lima se factura en soles.
 *
 * Hasta la migración 042 no había dónde decirlo. Quien registraba la compra
 * escribía el número de la factura, `S/ 15.20`, en un campo que el resto del
 * sistema lee como dólares: el costo entraba al inventario inflado casi cuatro
 * veces, el margen salía negativo, y **no saltaba ningún error**.
 *
 * ---------------------------------------------------------------------------
 * Por qué se escribe en soles y no se convierte antes
 * ---------------------------------------------------------------------------
 * Porque el operador tiene la factura delante. Escribir lo que dice el papel
 * siempre es menos trabajo y menos errores que hacer una división de cabeza —y
 * además deja auditable de dónde salió el costo. La conversión ocurre una sola
 * vez, al recibir la mercadería, que es cuando entra al kardex.
 */
export function BloqueMoneda({
  moneda,
  tipoCambio,
  fecha,
  despachar,
}: {
  moneda: Moneda;
  tipoCambio: number;
  /** La de la compra: el tipo de cambio que se pide es el de ESE día. */
  fecha: string;
  despachar: (a: Accion) => void;
}) {
  const [buscando, iniciar] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);

  const enSoles = moneda !== "USD";

  const traer = () => {
    setAviso(null);
    iniciar(async () => {
      const r = await tipoCambioDelDia(fecha);
      if (!r.ok) {
        // Nunca bloquea: se dice qué pasó y se sigue a mano. El número está en
        // la factura o en cualquier buscador.
        setAviso(`${r.error} Puedes escribirlo a mano.`);
        return;
      }
      // El de VENTA y no el de compra: es el que se paga cuando se compran
      // dólares para pagar, y el que usa SUNAT para valorizar una adquisición.
      despachar({ tipo: "tipoCambio", valor: r.venta });
      setAviso(`SUNAT, ${r.fecha}: compra ${r.compra} · venta ${r.venta}.`);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Moneda de la factura</span>
          <SelectNativo
            value={moneda}
            onChange={(e) =>
              // El `as` es honesto: las opciones del select SON el tipo.
              despachar({ tipo: "moneda", valor: e.target.value as Moneda })
            }
            className="h-11 md:h-control-md"
          >
            {(Object.keys(ETIQUETA_MONEDA) as Moneda[]).map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MONEDA[m]}
              </option>
            ))}
          </SelectNativo>
          <span className="text-xs text-[var(--fg-muted)]">
            La del papel que tienes delante, no la del sistema.
          </span>
        </label>

        {enSoles ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Tipo de cambio <span className="text-[var(--danger)]">*</span>
            </span>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="0.0001"
                numerico
                value={tipoCambio || ""}
                onChange={(e) =>
                  despachar({ tipo: "tipoCambio", valor: Number(e.target.value) })
                }
                placeholder="3.7520"
                className="h-11 md:h-control-md"
                aria-label="Soles por dólar"
              />
              <Button
                type="button"
                variant="subtle"
                className="h-11 shrink-0 md:h-control-md"
                onClick={traer}
                loading={buscando}
                disabled={buscando}
              >
                <Download aria-hidden="true" />
                {buscando ? "…" : "SUNAT"}
              </Button>
            </div>
            <span className="text-xs text-[var(--fg-muted)]">
              Soles por dólar el día de la compra.
            </span>
          </label>
        ) : null}
      </div>

      {aviso ? (
        <p role="status" className="text-xs text-[var(--fg-muted)]">
          {aviso}
        </p>
      ) : null}

      {/* El aviso que de verdad importa: sin este número la compra no se puede
          guardar, y decirlo aquí evita descubrirlo al pulsar «Registrar». */}
      {enSoles && !tipoCambio ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-2.5 text-sm"
        >
          Falta el tipo de cambio. Sin él no se puede guardar: el costo entraría
          al inventario multiplicado por casi cuatro.
        </p>
      ) : null}

      {enSoles && tipoCambio > 0 ? (
        <p className="text-xs text-[var(--fg-muted)]">
          Los montos de esta compra se escriben en{" "}
          <strong>{SIMBOLO_MONEDA[moneda]}</strong> y se cuadran contra la
          factura. Al recibir la mercadería entran al inventario en dólares, a{" "}
          <span className="tabular">{tipoCambio}</span>.
        </p>
      ) : null}
    </div>
  );
}
