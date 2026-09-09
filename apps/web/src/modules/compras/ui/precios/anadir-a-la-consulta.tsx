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
import { Check, Plus, UserPlus } from "lucide-react";

import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import {
  candidatosPara,
  queLeFalta,
  type Candidato,
} from "../../dominio/anadir-a-ronda";
import type { ItemConsultado, ProveedorConsultado } from "../../dominio/comparador";
import type { Referencia } from "../../dominio/referencia";
import { BuscadorProveedor } from "../pedir-precio/anadir";

/**
 * Meter a un proveedor en una ronda ya abierta, preguntándole por lo suyo.
 *
 * ---------------------------------------------------------------------------
 * Primero el producto, después el proveedor
 * ---------------------------------------------------------------------------
 * Luis, 09/09: *«cuando abra el modal primero tiene que decir a qué producto
 * quieres agregar el proveedor, después busco el proveedor; ese buscador
 * inteligente tiene que ser»*.
 *
 * En ese orden el buscador puede proponer, que al revés no podía: sabiendo los
 * productos, el sistema ya sabe quién los vende —`proveedor_productos`, que se
 * llena sola con cada compra (046)— y los enseña **sin escribir nada**.
 * Escribir queda para el proveedor nuevo, el que recomendaron, el que trae una
 * marca que nunca se compró.
 *
 * Y es la misma razón por la que «Pedir precio» tiene dos modos desde el
 * 03/09 —*«cada producto es de diferente proveedor, no el mismo»*—: al de
 * retenes no se le pregunta por unas chapas SKF.
 *
 * ---------------------------------------------------------------------------
 * La validación
 * ---------------------------------------------------------------------------
 * *«puede ser que se equivoque, seleccione un producto con el mismo proveedor
 * que ya está; no debería dejar cosas así»*. Son dos casos y solo uno es un
 * error: si ya se le preguntó por TODO lo elegido no hay nada que hacer y se
 * bloquea; si solo por parte, se deja y se dice qué se le añade —eso es el
 * caso corriente, el que vende cuatro de los seis—. La cuenta está en
 * `dominio/anadir-a-ronda.ts`, con sus tests.
 */
export function AnadirALaConsulta({
  items,
  referencias,
  enLaRonda,
  preguntadas,
  enCurso,
  onAnadir,
}: {
  /** Los productos de la ronda, en su orden. */
  items: readonly ItemConsultado[];
  /** Quién vende cada producto, por `producto_id`. Puede venir vacío. */
  referencias: Readonly<Record<string, Referencia>>;
  /** Los proveedores que ya están en la ronda. */
  enLaRonda: readonly ProveedorConsultado[];
  /** `item_id|consulta_proveedor_id` de lo que ya se preguntó (058). */
  preguntadas: ReadonlySet<string>;
  enCurso: boolean;
  onAnadir: (proveedorId: string, itemIds: string[]) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [elegidos, setElegidos] = React.useState<string[]>([]);
  const [paso, setPaso] = React.useState<1 | 2>(1);

  const cerrar = () => {
    setAbierto(false);
    setElegidos([]);
    setPaso(1);
  };

  const alternar = (itemId: string) =>
    setElegidos((previos) =>
      previos.includes(itemId)
        ? previos.filter((x) => x !== itemId)
        : [...previos, itemId],
    );

  const candidatos = React.useMemo(
    () =>
      paso === 2
        ? candidatosPara(elegidos, items, referencias, enLaRonda, preguntadas)
        : [],
    [paso, elegidos, items, referencias, enLaRonda, preguntadas],
  );

  /** Los que ya no aportan nada: el buscador no los ofrece. */
  const inutiles = React.useMemo(
    () =>
      new Set(
        enLaRonda
          .filter(
            (p) =>
              queLeFalta(p.proveedor_id, elegidos, enLaRonda, preguntadas).porPreguntar
                .length === 0,
          )
          .map((p) => p.proveedor_id),
      ),
    [enLaRonda, elegidos, preguntadas],
  );

  const mandar = (proveedorId: string) => {
    const { porPreguntar } = queLeFalta(proveedorId, elegidos, enLaRonda, preguntadas);
    // No debería llegar aquí —los que no aportan nada salen bloqueados o
    // fuera del buscador— pero un «añadido» que no añade nada es peor que no
    // hacer nada.
    if (porPreguntar.length === 0) return;
    onAnadir(proveedorId, porPreguntar);
    cerrar();
  };

  const elegir = (p: ProveedorParaPedir) => mandar(p.id);

  const codigosElegidos = items
    .filter((i) => elegidos.includes(i.item_id))
    .map((i) => i.codigo)
    .join(", ");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAbierto(true)}
        className="gap-1.5"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        Añadir proveedor a esta consulta
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {paso === 1 ? "¿Para qué productos?" : "¿A quién le preguntas?"}
            </DialogTitle>
            <DialogDescription>
              {paso === 1
                ? "Marca lo que le vas a preguntar. Al que le llega una lista de cosas que no trabaja, contesta menos."
                : "Estos son los que consta que lo venden. Si es otro, búscalo abajo."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {paso === 1 ? (
              <>
                {items.length > 1 ? (
                  <div className="mb-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setElegidos(
                          elegidos.length === items.length
                            ? []
                            : items.map((i) => i.item_id),
                        )
                      }
                    >
                      {elegidos.length === items.length ? "Ninguno" : "Todos"}
                    </Button>
                  </div>
                ) : null}

                <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
                  {items.map((item) => (
                    <li key={item.item_id}>
                      <label className="flex cursor-pointer items-start gap-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={elegidos.includes(item.item_id)}
                          onChange={() => alternar(item.item_id)}
                          className="mt-1 size-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-semibold">
                            {item.codigo}
                          </span>
                          <span className="block text-sm text-[var(--fg-muted)]">
                            {item.marca ? `${item.marca} · ` : ""}
                            {item.descripcion}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-[var(--fg-muted)]">
                          {item.cantidad} {item.unidad}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mb-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                  Le vas a preguntar por <strong>{codigosElegidos}</strong>.{" "}
                  <button
                    type="button"
                    onClick={() => setPaso(1)}
                    className="font-medium underline underline-offset-2"
                  >
                    Cambiar
                  </button>
                </p>

                {candidatos.length > 0 ? (
                  <ul className="mb-4 flex flex-col divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
                    {candidatos.map((c) => (
                      <li key={c.proveedor_id}>
                        <FilaCandidato
                          candidato={c}
                          cuantosElegidos={elegidos.length}
                          onElegir={() => mandar(c.proveedor_id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-4 text-sm text-[var(--fg-muted)]">
                    No consta que nadie venda esto todavía —eso se va sabiendo
                    con cada compra—. Búscalo aquí abajo.
                  </p>
                )}

                <div className="border-t border-[var(--border-soft)] pt-3">
                  <BuscadorProveedor yaEstan={inutiles} onElegir={elegir} />
                </div>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            {paso === 1 ? (
              <Button
                type="button"
                disabled={elegidos.length === 0}
                onClick={() => setPaso(2)}
              >
                {elegidos.length === 0
                  ? "Marca al menos un producto"
                  : `Seguir con ${elegidos.length} ${elegidos.length === 1 ? "producto" : "productos"}`}
              </Button>
            ) : (
              <span className="text-sm text-[var(--fg-muted)]">
                {enCurso ? "Añadiendo…" : "Elige a uno de la lista, o búscalo."}
              </span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Un proveedor propuesto, con por qué se propone.
 *
 * El «vende 2 de 2» y el último costo son lo que hace de esto una propuesta y
 * no una lista: sin ellos hay que acordarse de quién es quién.
 */
function FilaCandidato({
  candidato: c,
  cuantosElegidos,
  onElegir,
}: {
  candidato: Candidato;
  cuantosElegidos: number;
  onElegir: () => void;
}) {
  // Ya se le preguntó por todo lo elegido: no se esconde, se enseña apagado.
  // Esconderlo hace pensar que se olvidó y se vuelve a buscar.
  if (c.porPreguntar.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 text-sm opacity-70">
        <Check className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{c.proveedor}</span>
        <span className="shrink-0 text-[var(--fg-muted)]">
          {cuantosElegidos === 1 ? "Ya se le preguntó" : "Ya se le preguntó por todos"}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onElegir}
      className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]"
    >
      <Plus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{c.proveedor}</span>
        <span className="block text-[var(--fg-muted)]">
          {c.vende > 0
            ? `vende ${c.vende} de ${cuantosElegidos}`
            : "no consta que lo venda"}
          {c.ultimoCostoUsd !== null
            ? ` · la última vez, ${formatearMoneda(c.ultimoCostoUsd, "USD")}`
            : ""}
          {c.yaPreguntados.length > 0
            ? ` · ya se le preguntó por ${c.yaPreguntados.length}, se le añade${
                c.porPreguntar.length === 1 ? " el otro" : "n los otros"
              }`
            : ""}
        </span>
      </span>
    </button>
  );
}
