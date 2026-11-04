"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Warehouse } from "lucide-react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@rodatech/ui";

import { usarStockEnVezDeComprar } from "../acciones/usar-stock";

/** Un producto de una orden sin comprar que el almacén ya cubre. */
export interface StockUsable {
  itemId: string;
  codigo: string;
  /** Lo que hay en el almacén. */
  stock: number;
  /** Lo que el pedido todavía tiene que entregar. */
  necesita: number;
}

/**
 * «Usar el stock», dentro de la tarjeta de una orden que todavía no se compró
 * (04/11). Luis: *«¿seguro que quieres utilizar el stock? Se borrará la orden
 * de compra»*. Si la orden solo lleva ese producto, se anula; si lleva más,
 * se le quita ese y sigue con los demás. Lo comprueba otra vez la base.
 */
export function UsarStock({
  usable,
  orden,
  soloEste,
  pedidoId,
  cotizacionId,
}: {
  usable: StockUsable;
  /** El número de la orden, para decirlo en la pregunta. */
  orden: string;
  /** Si es el único producto de la orden: entonces se anula entera. */
  soloEste: boolean;
  pedidoId: string;
  cotizacionId: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, iniciar] = React.useTransition();

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const r = await usarStockEnVezDeComprar({ itemId: usable.itemId, pedidoId, cotizacionId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbierto(false);
      toast.success(`${usable.codigo} sale del almacén`, {
        richColors: true,
        position: "top-center",
        duration: 8000,
        description:
          r.anuladas.length > 0
            ? `Se anuló la orden ${r.anuladas.join(", ")}.`
            : `Se quitó de la orden ${r.quitadas.join(", ")}.`,
      });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-[var(--ok)] bg-[var(--ok-bg)] px-3 py-2.5">
      <p className="text-base">
        <strong>{usable.codigo}</strong>: ya hay <strong>{usable.stock}</strong> en el almacén y el pedido necesita{" "}
        <strong>{usable.necesita}</strong>. No hace falta comprarlo.
      </p>
      <Button type="button" onClick={() => setAbierto(true)} className="h-11 gap-2 px-4 text-base">
        <Warehouse className="size-5" aria-hidden="true" />
        Usar el stock
      </Button>

      {abierto ? (
        <Dialog open onOpenChange={(v) => !v && !pendiente && setAbierto(false)}>
          <DialogContent ancho="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-lg">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
                  <Warehouse className="size-5" aria-hidden="true" />
                </span>
                ¿Usar el stock del almacén para {usable.codigo}?
              </DialogTitle>
              <DialogDescription className="text-base">
                Sale del almacén con la guía, como cualquier producto con stock.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="flex gap-3 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-base">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
                <p>
                  {soloEste ? (
                    <>
                      Se <strong>anulará la orden de compra {orden}</strong>: solo llevaba este producto.
                    </>
                  ) : (
                    <>
                      Se <strong>quitará {usable.codigo} de la orden {orden}</strong>; la orden sigue con sus otros
                      productos.
                    </>
                  )}{" "}
                  Si ya se la mandaste al proveedor, avísale.
                </p>
              </div>
              {error ? (
                <p role="alert" className="text-base text-[var(--danger)]">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmar} disabled={pendiente} className="gap-2">
                {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Sí, usar el stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
