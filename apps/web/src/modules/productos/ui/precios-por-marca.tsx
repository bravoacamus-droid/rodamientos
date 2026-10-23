"use client";

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
  DialogTrigger,
  Input,
  SelectNativo,
  buttonVariants,
  cn,
  formatearMoneda,
  toast,
} from "@rodatech/ui";
import { Percent, Undo2 } from "lucide-react";

import { cambiarPreciosPorMarca, deshacerCambioPrecios, type VistaCambio } from "../acciones/precios-marca";

/**
 * «Cambiar precios por marca» (155).
 *
 * Tres pasos a la vista, porque escribe en cientos de productos a la vez:
 * elegir marca y porcentaje → «Ver qué cambia» (cuántos y cinco ejemplos,
 * sin tocar nada) → «Cambiar N precios». Y después, «Deshacer» ahí mismo: un
 * dedo que se va en el porcentaje no puede costar una tarde arreglándolo.
 */
export function PreciosPorMarca({ marcas }: { marcas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [marca, setMarca] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [vista, setVista] = React.useState<VistaCambio | null>(null);
  const [hecho, setHecho] = React.useState<VistaCambio | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const porcentaje = Number(texto.replace(",", "."));
  const valido = marca !== "" && Number.isFinite(porcentaje) && porcentaje !== 0;
  const nombreMarca = marcas.find((m) => m.id === marca)?.nombre ?? "";
  const frase = porcentaje > 0 ? `suben un ${porcentaje} %` : `bajan un ${Math.abs(porcentaje)} %`;

  const reiniciar = () => {
    setVista(null);
    setHecho(null);
  };

  const llamar = async (aplicar: boolean) => {
    setOcupado(true);
    try {
      const r = await cambiarPreciosPorMarca({ marca, porcentaje, aplicar });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (aplicar) {
        setHecho(r.datos);
        setVista(null);
        toast.success(`Listo: ${r.datos.productos} precios de ${nombreMarca} ${frase}.`);
        router.refresh();
      } else {
        setVista(r.datos);
      }
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async () => {
    if (!hecho?.cambioId) return;
    setOcupado(true);
    try {
      const r = await deshacerCambioPrecios(hecho.cambioId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.datos.respetados > 0
          ? `Deshecho: ${r.datos.devueltos} precios vuelven a como estaban; ${r.datos.respetados} se habían cambiado a mano después y se dejan.`
          : `Deshecho: los ${r.datos.devueltos} precios vuelven a como estaban.`,
      );
      setHecho(null);
      router.refresh();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) reiniciar();
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 px-3 text-sm")}>
        <Percent className="size-4" aria-hidden="true" />
        Cambiar precios por marca
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar precios por marca</DialogTitle>
          <DialogDescription>
            Sube o baja el precio de venta de todos los productos de una marca. El precio mínimo se mueve igual.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {hecho ? (
            <div className="rounded-md border border-[var(--ok)] bg-[var(--ok-bg)] p-3 text-base">
              <p>
                <strong>{hecho.productos} precios de {nombreMarca}</strong> {frase}.
              </p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Si fue un error, se deshace aquí mismo. También después: lo que alguien cambie a mano se respeta.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Marca</span>
                  <SelectNativo
                    value={marca}
                    onChange={(e) => {
                      setMarca(e.target.value);
                      setVista(null);
                    }}
                  >
                    <option value="">Elige la marca…</option>
                    {marcas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </SelectNativo>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Cuánto (%)</span>
                  <Input
                    inputMode="decimal"
                    placeholder="5 o -3"
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      setVista(null);
                    }}
                    className="text-right tabular"
                  />
                </label>
              </div>
              <p className="text-sm text-[var(--fg-muted)]">
                Un número positivo sube los precios; uno negativo, con «-», los baja.
              </p>

              {vista ? (
                vista.productos === 0 ? (
                  <p className="rounded-md bg-[var(--surface-2)] p-3 text-base">
                    {nombreMarca} no tiene productos con precio de venta: no hay nada que cambiar.
                  </p>
                ) : (
                  <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3">
                    <p className="text-base">
                      Cambiarán <strong>{vista.productos} precios</strong> de {nombreMarca}. Por ejemplo:
                    </p>
                    <ul className="mt-2 flex flex-col gap-1 text-base">
                      {vista.ejemplos.map((e) => (
                        <li key={e.codigo} className="flex justify-between gap-3">
                          <span className="truncate font-medium">{e.codigo}</span>
                          <span className="tabular shrink-0">
                            {formatearMoneda(e.antes)} → <strong>{formatearMoneda(e.despues)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {hecho ? (
            <>
              <Button variant="outline" disabled={ocupado} onClick={() => void deshacer()} className="gap-1.5">
                <Undo2 className="size-4" aria-hidden="true" />
                Deshacer
              </Button>
              <Button onClick={() => setAbierto(false)}>Cerrar</Button>
            </>
          ) : vista && vista.productos > 0 ? (
            <>
              <Button variant="outline" disabled={ocupado} onClick={() => setVista(null)}>
                Volver
              </Button>
              <Button disabled={ocupado} onClick={() => void llamar(true)}>
                Cambiar {vista.productos} precios
              </Button>
            </>
          ) : (
            <Button disabled={!valido || ocupado} onClick={() => void llamar(false)}>
              Ver qué cambia
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
