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
} from "@rodatech/ui";
import { Plus, UserPlus } from "lucide-react";

import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import type { ItemConsultado } from "../../dominio/comparador";
import { BuscadorProveedor } from "../pedir-precio/anadir";

/**
 * Meter a un proveedor en una ronda ya abierta, preguntándole por lo suyo.
 *
 * ---------------------------------------------------------------------------
 * Por qué es un diálogo y no un buscador suelto
 * ---------------------------------------------------------------------------
 * La primera versión de esto le preguntaba por TODA la lista. Luis, 09/09:
 * *«tú sabes que para añadir un proveedor tiene que saber a qué producto, ¿no?
 * ¿lo manejamos como modal o qué?»*. Y es la misma razón por la que «Pedir
 * precio» tiene dos modos desde el 03/09: *«cada producto es de diferente
 * proveedor, no el mismo»*. Al de retenes no se le pregunta por unas chapas
 * SKF; le llega ruido y contesta menos.
 *
 * Así que son dos pasos, y el segundo no se puede saltar: a quién, y por qué
 * cosas. Van marcadas todas de salida porque el caso corriente es el
 * distribuidor general al que se le pregunta por todo, pero se ven una a una
 * y desmarcarlas es un clic.
 *
 * Lo que NO hace: adivinar. Se podría marcar solo lo que consta que vende,
 * pero `proveedor_productos` se llena con las compras (046) y de un proveedor
 * nuevo no consta nada — marcaría cero y parecería roto.
 */
export function AnadirALaConsulta({
  items,
  yaEstan,
  enCurso,
  onAnadir,
}: {
  /** Los productos de la ronda, en su orden. */
  items: readonly ItemConsultado[];
  /** Los que ya están en la ronda, para no ofrecerlos otra vez. */
  yaEstan: ReadonlySet<string>;
  enCurso: boolean;
  onAnadir: (proveedorId: string, itemIds: string[]) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [elegido, setElegido] = React.useState<ProveedorParaPedir | null>(null);
  const [marcados, setMarcados] = React.useState<string[]>([]);

  const cerrar = () => {
    setAbierto(false);
    setElegido(null);
    setMarcados([]);
  };

  const alternar = (itemId: string) =>
    setMarcados((previos) =>
      previos.includes(itemId)
        ? previos.filter((x) => x !== itemId)
        : [...previos, itemId],
    );

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
              {elegido ? "¿Qué le preguntas?" : "¿A quién le faltó preguntarle?"}
            </DialogTitle>
            <DialogDescription>
              {elegido
                ? "Marca solo lo que vende. Al que le llega una lista de cosas que no trabaja, contesta menos."
                : "Búscalo en el maestro entero, aunque nunca le hayas comprado nada."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {elegido === null ? (
              <BuscadorProveedor
                yaEstan={yaEstan}
                enfocar
                onElegir={(p) => {
                  setElegido(p);
                  // Todas marcadas: el caso corriente es el distribuidor
                  // general. Quitar es más rápido que poner.
                  setMarcados(items.map((i) => i.item_id));
                }}
              />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <span className="text-sm font-semibold">{elegido.razon_social}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setElegido(null);
                      setMarcados([]);
                    }}
                  >
                    Cambiar
                  </Button>
                </div>

                <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
                  {items.map((item) => (
                    <li key={item.item_id}>
                      <label className="flex cursor-pointer items-start gap-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={marcados.includes(item.item_id)}
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

                {marcados.length === 0 ? (
                  <p className="mt-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
                    Sin marcar nada no hay nada que preguntarle.
                  </p>
                ) : null}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={elegido === null || marcados.length === 0 || enCurso}
              onClick={() => {
                if (!elegido) return;
                onAnadir(elegido.id, marcados);
                cerrar();
              }}
              className="gap-1.5"
            >
              <Plus className="size-4" aria-hidden="true" />
              {enCurso
                ? "Añadiendo…"
                : elegido === null
                  ? "Elige un proveedor"
                  : `Preguntarle por ${marcados.length} ${marcados.length === 1 ? "producto" : "productos"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
