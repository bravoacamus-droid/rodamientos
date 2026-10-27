"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  buttonVariants,
  cn,
  formatearFechaHora,
  formatearMoneda,
  toast,
} from "@rodatech/ui";
import { ArrowRight, Percent, Undo2 } from "lucide-react";

import {
  cambiarPreciosPorMarca,
  deshacerCambioPrecios,
  ultimosCambiosPrecio,
  type CambioPrecio,
  type VistaCambio,
} from "../acciones/precios-marca";

/**
 * «Cambiar precios por marca» (155).
 *
 * Tres pasos a la vista, porque escribe en cientos de productos a la vez:
 * elegir marca y porcentaje → «Ver qué cambia» (cuántos y cinco ejemplos,
 * sin tocar nada) → «Cambiar N precios». Y después, «Deshacer» ahí mismo: un
 * dedo que se va en el porcentaje no puede costar una tarde arreglándolo.
 *
 * Desde el 27/10 (QA-08) también DESPUÉS: debajo van los últimos cambios, cada
 * uno con su «Deshacer». La historia la guardaba `cambios_precio` desde la
 * 155 y ninguna pantalla la leía; cerrado el diálogo, ya no había botón. La
 * base (160) obliga a deshacer en orden —el último primero— y no marca
 * deshecho lo que no devolvió ningún precio.
 */
export function PreciosPorMarca({ marcas }: { marcas: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [marca, setMarca] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [vista, setVista] = React.useState<VistaCambio | null>(null);
  const [hecho, setHecho] = React.useState<VistaCambio | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [cambios, setCambios] = React.useState<CambioPrecio[] | null>(null);
  const [errorCambios, setErrorCambios] = React.useState<string | null>(null);

  const porcentaje = Number(texto.replace(",", "."));
  const valido = marca !== "" && Number.isFinite(porcentaje) && porcentaje !== 0;
  const nombreMarca = marcas.find((m) => m.id === marca)?.nombre ?? "";
  const frase = porcentaje > 0 ? `suben un ${porcentaje} %` : `bajan un ${Math.abs(porcentaje)} %`;

  const cargarCambios = React.useCallback(async () => {
    const r = await ultimosCambiosPrecio();
    if (r.ok) {
      setCambios(r.datos);
      setErrorCambios(null);
    } else {
      setErrorCambios(r.error);
    }
  }, []);

  // Se piden al abrir, no antes: la lista de productos no los necesita.
  React.useEffect(() => {
    if (abierto) void cargarCambios();
  }, [abierto, cargarCambios]);

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
        void cargarCambios();
        router.refresh();
      } else {
        setVista(r.datos);
      }
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async (cambioId: number) => {
    setOcupado(true);
    try {
      const r = await deshacerCambioPrecios(cambioId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (!r.datos.deshecho) {
        toast.error(
          "No se devolvió ningún precio: todos se cambiaron a mano después de este cambio. No hay nada que deshacer.",
        );
      } else {
        toast.success(
          r.datos.respetados > 0
            ? `Deshecho: ${r.datos.devueltos} precios vuelven a como estaban; ${r.datos.respetados} se habían cambiado a mano después y se dejan.`
            : `Deshecho: los ${r.datos.devueltos} precios vuelven a como estaban.`,
        );
      }
      if (hecho?.cambioId === cambioId) setHecho(null);
      void cargarCambios();
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
                Si fue un error, se deshace aquí mismo. También después, desde «Últimos cambios de precio»: lo que
                alguien cambie a mano se respeta.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                {/* Con buscador (FS-11, 27/10), como en la ficha del
                    producto: son 60 marcas, y un desplegable plano de 60 se
                    recorre con la rueda. */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="precios-marca" className="text-sm font-medium">
                    Marca
                  </label>
                  <Combobox
                    id="precios-marca"
                    opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
                    valor={marca || null}
                    onCambio={(v) => {
                      setMarca(v ?? "");
                      setVista(null);
                    }}
                    placeholder="Elige la marca…"
                    placeholderBusqueda="Escribe la marca"
                    textoVacio="Ninguna marca coincide."
                  />
                </div>
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
                          <span className="tabular inline-flex shrink-0 items-center gap-1">
                            {formatearMoneda(e.antes)}
                            <ArrowRight className="inline size-4 align-[-2px]" aria-label="pasa a" />
                            <strong>{formatearMoneda(e.despues)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : null}
            </>
          )}

          <section className="border-t border-[var(--border-soft)] pt-3">
            <h3 className="text-sm font-semibold">Últimos cambios de precio</h3>
            {errorCambios ? (
              <p className="mt-1 text-sm text-[var(--danger)]">{errorCambios}</p>
            ) : cambios === null ? (
              <p className="mt-1 text-sm text-[var(--fg-muted)]">Cargando…</p>
            ) : cambios.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--fg-muted)]">Todavía no se ha cambiado ningún precio por marca.</p>
            ) : (
              <ul className="mt-1 flex flex-col divide-y divide-[var(--border-soft)]">
                {cambios.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p>
                        <strong>{c.marca}</strong>{" "}
                        <span className="tabular">
                          {c.porcentaje > 0 ? "+" : "−"}
                          {Math.abs(c.porcentaje)} %
                        </span>{" "}
                        · {c.productos} {c.productos === 1 ? "producto" : "productos"}
                      </p>
                      <p className="text-[var(--fg-muted)]">
                        {formatearFechaHora(c.creadoEn)}
                        {c.quien ? ` · ${c.quien}` : ""}
                      </p>
                    </div>
                    {c.deshechoEn ? (
                      <span className="text-[var(--fg-muted)]">Deshecho el {formatearFechaHora(c.deshechoEn)}</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-sm"
                        disabled={ocupado}
                        onClick={() => void deshacer(c.id)}
                        aria-label={`Deshacer el cambio de ${c.marca} del ${formatearFechaHora(c.creadoEn)}`}
                      >
                        <Undo2 className="size-4" aria-hidden="true" />
                        Deshacer
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogBody>

        <DialogFooter>
          {hecho ? (
            <>
              <Button
                variant="outline"
                disabled={ocupado || !hecho.cambioId}
                onClick={() => hecho.cambioId && void deshacer(hecho.cambioId)}
                className="gap-1.5"
              >
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
