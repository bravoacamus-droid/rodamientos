"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
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
  toast,
} from "@rodatech/ui";

import { clonar, lineasParaClonar, type LineaParaClonar } from "../acciones/gestionar";

/**
 * Clonar una cotización eligiendo qué se lleva la copia (02/11).
 *
 * Moisés: *«hace una cotización de 10 ítems y le confirman solo 6 o 7, pero
 * no quiere perder esa cotización: la clona y la clonada le quita los ítems y
 * deja nomás lo que lleva el cliente»*. Aquí se desmarca lo que no llevó y se
 * corrige la cantidad, en un paso. La original no se toca; la copia nace en
 * borrador con su propio número.
 *
 * Los precios cotizados se MANTIENEN por defecto: el cliente acaba de
 * confirmar a esos precios. «Precios de hoy» es para volver a cotizar algo
 * viejo, y aun así un precio de catálogo en cero no pisa al cotizado.
 */
export function DialogoClonar({
  id,
  numero,
  abierto,
  onCerrar,
}: {
  id: string;
  numero: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [lineas, setLineas] = React.useState<LineaParaClonar[] | null>(null);
  const [marcadas, setMarcadas] = React.useState<Record<string, boolean>>({});
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({});
  const [precios, setPrecios] = React.useState<"cotizados" | "catalogo">("cotizados");
  const [error, setError] = React.useState<string | null>(null);
  const [clonando, iniciar] = React.useTransition();

  // Las líneas se piden al abrir: la mayoría de filas no se clonan nunca.
  React.useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setLineas(null);
    setError(null);
    void lineasParaClonar(id).then((r) => {
      if (!vigente) return;
      if (!r.ok) return setError(r.error);
      setLineas(r.datos);
      setMarcadas(Object.fromEntries(r.datos.map((l) => [l.id, true])));
      setCantidades(Object.fromEntries(r.datos.map((l) => [l.id, String(l.cantidad)])));
    });
    return () => {
      vigente = false;
    };
  }, [abierto, id]);

  const elegidas = (lineas ?? []).filter((l) => marcadas[l.id]);
  const cantidad = (l: LineaParaClonar) => Number(String(cantidades[l.id] ?? "").replace(",", "."));
  const malas = elegidas.filter((l) => !(cantidad(l) > 0));
  const subtotal = elegidas.reduce((a, l) => a + (cantidad(l) > 0 ? cantidad(l) : 0) * l.valor_unitario * (1 - l.descuento_pct / 100), 0);
  const todas = lineas !== null && elegidas.length === lineas.length;

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const r = await clonar(id, {
        lineas: elegidas.map((l) => ({ id: l.id, cantidad: cantidad(l) })),
        precios,
      });
      if (!r.ok) return setError(r.error);
      toast.success(`Se creó ${r.numero ?? "la copia"}`, {
        description: `Con ${elegidas.length} ${elegidas.length === 1 ? "línea" : "líneas"} de ${numero}. ${numero} queda como estaba.`,
      });
      onCerrar();
      if (r.id) router.push(`/cotizaciones/${r.id}`);
    });

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clonar {numero}</DialogTitle>
          <DialogDescription>
            Desmarca lo que el cliente no lleva y corrige las cantidades. {numero} no se toca: la copia sale como una
            cotización nueva, en borrador.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {lineas === null && !error ? (
            <p className="py-6 text-center text-sm text-[var(--fg-muted)]">Cargando las líneas…</p>
          ) : null}

          {lineas && lineas.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {elegidas.length} de {lineas.length} líneas
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMarcadas(Object.fromEntries(lineas.map((l) => [l.id, !todas])))}
                >
                  {todas ? "Desmarcar todas" : "Marcar todas"}
                </Button>
              </div>
              <ul className="flex max-h-[45vh] flex-col divide-y divide-[var(--border-soft)] overflow-y-auto rounded-md border border-[var(--border)]">
                {lineas.map((l) => {
                  const si = Boolean(marcadas[l.id]);
                  return (
                    <li key={l.id} className={`flex items-center gap-3 px-3 py-2 ${si ? "" : "opacity-55"}`}>
                      <input
                        type="checkbox"
                        className="size-5 shrink-0"
                        checked={si}
                        aria-label={`Llevar ${l.codigo ?? l.descripcion}`}
                        onChange={(e) => setMarcadas((m) => ({ ...m, [l.id]: e.target.checked }))}
                      />
                      <span className="w-6 shrink-0 text-right text-sm tabular text-[var(--fg-subtle)]">{l.orden}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-medium">{l.codigo ?? "—"}</span>
                        <span className="block truncate text-sm text-[var(--fg-muted)]" title={l.descripcion}>
                          {l.descripcion}
                        </span>
                      </span>
                      <Input
                        inputMode="decimal"
                        value={cantidades[l.id] ?? ""}
                        disabled={!si}
                        onChange={(e) => setCantidades((c) => ({ ...c, [l.id]: e.target.value }))}
                        className="w-20 shrink-0 text-right tabular"
                        aria-label={`Cantidad de ${l.codigo ?? l.descripcion}`}
                      />
                      <span className="w-24 shrink-0 text-right text-sm tabular">$ {l.valor_unitario.toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-medium">Precios</legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="precios"
                    className="mt-0.5 size-4"
                    checked={precios === "cotizados"}
                    onChange={() => setPrecios("cotizados")}
                  />
                  <span>
                    <strong>Los mismos de {numero}</strong>
                    <span className="block text-[var(--fg-muted)]">Para cuando el cliente confirma parte de lo cotizado.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="precios"
                    className="mt-0.5 size-4"
                    checked={precios === "catalogo"}
                    onChange={() => setPrecios("catalogo")}
                  />
                  <span>
                    <strong>Los precios de hoy del catálogo</strong>
                    <span className="block text-[var(--fg-muted)]">
                      Para volver a cotizar algo antiguo. Donde el catálogo no tiene precio, se queda el cotizado.
                    </span>
                  </span>
                </label>
              </fieldset>

              <p className="text-right text-sm">
                Subtotal de la copia{precios === "catalogo" ? " (con los precios cotizados)" : ""}:{" "}
                <strong className="tabular">$ {subtotal.toFixed(2)}</strong> sin IGV
              </p>
            </>
          ) : null}

          {malas.length > 0 ? (
            <p className="text-sm text-[var(--danger)]">
              Revisa la cantidad de {malas.map((l) => l.codigo ?? l.orden).join(", ")}: tiene que ser mayor que cero.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={clonando}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={clonando || elegidas.length === 0 || malas.length > 0 || !lineas}>
            <Copy className="size-4" aria-hidden="true" />
            {clonando ? "Clonando…" : `Clonar con ${elegidas.length} ${elegidas.length === 1 ? "línea" : "líneas"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
