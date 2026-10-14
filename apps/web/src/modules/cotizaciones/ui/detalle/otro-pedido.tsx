"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
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
} from "@rodatech/ui";

import { repetirPedido } from "../../acciones/gestionar";
import type { LineaParaConfirmar } from "./confirmar";
import { unidadLegible } from "../../dominio/unidades";

/**
 * «Atender otro pedido» con la misma cotización (121).
 *
 * Willy, 14/10: *«ese producto me pide 20 unidades cada cierto tiempo… cojo
 * de una misma cotización, le vuelvo a hacer la guía y la factura»*. Viene
 * todo marcado con lo cotizado —lo normal es que repita—, se cambia lo que
 * no, se pone la O/C nueva y se va directo a hacer la guía. La guía y la
 * factura salen con su propio número, colgando de esta cotización.
 */
export function OtroPedido({ cotizacionId, lineas }: { cotizacionId: string; lineas: LineaParaConfirmar[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [cantidades, setCantidades] = React.useState<Record<string, number>>({});
  const [oc, setOc] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setCantidades(Object.fromEntries(lineas.map((l) => [l.id, l.cantidad])));
    setOc("");
    setError(null);
  }, [abierto, lineas]);

  const enviar = () =>
    iniciar(async () => {
      setError(null);
      const r = await repetirPedido(
        cotizacionId,
        lineas.map((l) => ({ item_id: l.id, cantidad: cantidades[l.id] ?? 0 })),
        oc,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      // Lo que sigue es sacar la mercadería: a la guía, ya con este pedido.
      router.push(`/guias/nueva?cotizacion=${cotizacionId}`);
    });

  return (
    <>
      <Button onClick={() => setAbierto(true)}>
        <Repeat className="size-[18px] shrink-0" aria-hidden="true" />
        Atender otro pedido
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Otro pedido con esta cotización</DialogTitle>
            <DialogDescription>
              Al mismo precio. La guía y la factura salen con su propio número; pon cuánto pide esta vez.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <ul className="flex max-h-[45vh] flex-col divide-y divide-[var(--border-soft)] overflow-y-auto">
              {lineas.map((l) => (
                <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{l.codigo}</p>
                    <p className="line-clamp-2 text-sm text-[var(--fg-muted)]">{l.descripcion}</p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      numerico
                      className="w-24"
                      value={cantidades[l.id] ?? 0}
                      onChange={(e) =>
                        setCantidades((c) => ({ ...c, [l.id]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      aria-label={`Cantidad de ${l.codigo}`}
                    />
                    <span className="text-sm text-[var(--fg-muted)]">{unidadLegible(l.unidad)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Orden de compra de este pedido</span>
              <Input value={oc} maxLength={60} onChange={(e) => setOc(e.target.value)} placeholder="La que mandó el cliente" />
            </label>
            {error ? (
              <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="button" onClick={enviar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar pedido e ir a la guía"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
