"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button, Input } from "@rodatech/ui";

import { ordenesUsadas } from "../acciones/ordenes-usadas";
import { sugerenciasPara } from "../dominio/ordenes";

/**
 * La orden de compra del cliente, con las que ya usó a mano (14/10).
 *
 * UNA por guía —Luis: *«solo puede tener un número de orden de compra de
 * cliente; pero sí un número de orden de cliente puede estar en varias
 * guías»*—. Así que el «buscador inteligente» es esto: se escribe, y debajo
 * salen las O/C que ya usó ese cliente, filtradas por lo tecleado; pulsar una
 * la pone. La segunda guía de un pedido se rellena con un clic y sin
 * teclearla distinta.
 */
export function OrdenCompra({
  id,
  valor,
  onCambio,
  clienteId,
}: {
  id: string;
  valor: string;
  onCambio: (texto: string) => void;
  /** Para sugerir las que ya usó. Sin cliente, no hay sugerencias. */
  clienteId: string | null;
}) {
  const [usadas, setUsadas] = React.useState<string[]>([]);

  React.useEffect(() => {
    let vigente = true;
    if (!clienteId) {
      setUsadas([]);
      return;
    }
    void ordenesUsadas(clienteId).then((lista) => {
      if (vigente) setUsadas(lista);
    });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  const sugeridas = sugerenciasPara(usadas, valor).slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={usadas.length ? "Escríbela o elige una de abajo" : "OC-4471 (si la mandó)"}
          maxLength={100}
          className="min-w-0 flex-1"
        />
        {valor ? (
          <Button type="button" variant="outline" onClick={() => onCambio("")} aria-label="Quitar la orden de compra">
            <X className="size-4" aria-hidden="true" />
            Quitar
          </Button>
        ) : null}
      </div>

      {sugeridas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--fg-muted)]">Ya usadas con este cliente:</span>
          {sugeridas.map((s) => (
            <Button key={s} type="button" variant="outline" size="sm" className="text-sm" onClick={() => onCambio(s)}>
              <span className="font-mono">{s}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
