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
import { Trash2 } from "lucide-react";

import type { ItemConsultado } from "../../dominio/comparador";

/**
 * Sacar a un proveedor de la ronda, entero o de algunos productos.
 *
 * ---------------------------------------------------------------------------
 * Los dos casos en una sola puerta
 * ---------------------------------------------------------------------------
 * Luis, 09/09: *«nos falta ahí eliminar por producto al proveedor si es que se
 * equivocó, o eliminar el proveedor completo con sus productos»*.
 *
 * Son dos cosas distintas pero se piensan igual —«a este no le tenía que haber
 * preguntado esto»— así que es un diálogo con las líneas marcadas de salida:
 * dejarlas todas quita al proveedor entero, desmarcar deja lo que sí le
 * tocaba. Dos botones separados obligarían a decidir cuál antes de ver qué le
 * preguntaste.
 *
 * El orden es el contrario al de añadir —allí primero el producto y luego el
 * proveedor— y es a propósito: aquí se entra desde la tarjeta de un proveedor
 * concreto, que ya está señalado antes de abrir nada.
 *
 * ---------------------------------------------------------------------------
 * Se dice lo que se pierde, con el número delante
 * ---------------------------------------------------------------------------
 * Quitar un producto borra también el precio que dio para ese producto: en la
 * base son dos tablas hermanas y dejar el precio sin la pregunta pinta en la
 * rejilla un precio de algo que nadie preguntó —y puede ganar la comparación—.
 * Es destructivo, así que va con confirmación y contando cuántos precios se
 * lleva.
 */
export function QuitarDeLaConsulta({
  proveedor,
  suyos,
  conPrecio,
  enCurso,
  onQuitar,
}: {
  proveedor: string;
  /** Los productos que se le preguntaron A ÉL, en el orden de la ronda. */
  suyos: readonly ItemConsultado[];
  /** De esos, los `item_id` de los que ya contestó: son los que se pierden. */
  conPrecio: ReadonlySet<string>;
  enCurso: boolean;
  /** `items` vacío significa quitarlo entero. */
  onQuitar: (items: string[]) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [marcados, setMarcados] = React.useState<string[]>([]);

  const abrir = () => {
    // Todas marcadas: lo corriente es quitarlo entero. Desmarcar es la
    // excepción, y queda a la vista.
    setMarcados(suyos.map((i) => i.item_id));
    setAbierto(true);
  };

  const alternar = (itemId: string) =>
    setMarcados((previos) =>
      previos.includes(itemId)
        ? previos.filter((x) => x !== itemId)
        : [...previos, itemId],
    );

  const entero = marcados.length === suyos.length;
  const preciosQueSePierden = marcados.filter((id) => conPrecio.has(id)).length;
  /**
   * Un proveedor sin nada asignado.
   *
   * No debería pasar —tanto abrir la ronda como añadir exigen al menos un
   * producto— pero si pasa, es justo el estado que hay que poder limpiar: una
   * columna en la rejilla sin nada que contestar. Sin esto el botón se
   * quedaría apagado para siempre, porque no hay nada que marcar.
   */
  const sinNada = suyos.length === 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={abrir}
        className="w-full gap-1.5 border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-bg)]"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Quitar
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            {/*
              El nombre va en la descripción y no en el título, aunque sea lo
              importante: «IMPORTADORA Y DISTRIBUIDORA DE RETENES RODAMIENTOS Y
              AFINES SOCIEDAD ANONIMA» son ochenta caracteres, y de título se
              come dos líneas y roza el aspa de cerrar. Abajo cabe y sigue en
              negrita.
            */}
            <DialogTitle>Quitar de la consulta</DialogTitle>
            <DialogDescription>
              <strong className="text-fg">{proveedor}</strong>. Déjalo así para
              sacarlo entero, o desmarca lo que sí le tocaba preguntarle.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
              {suyos.map((item) => (
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
                    {conPrecio.has(item.item_id) ? (
                      <span className="shrink-0 text-sm font-medium text-[var(--warn)]">
                        ya contestó
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>

            {sinNada ? (
              <p className="text-sm">
                A <strong>{proveedor}</strong> no se le preguntó por nada, así
                que solo queda sacarlo de la consulta.
              </p>
            ) : null}

            {marcados.length === 0 && !sinNada ? (
              <p className="mt-3 text-sm text-[var(--fg-muted)]">
                Sin marcar nada no se quita nada.
              </p>
            ) : marcados.length === 0 ? null : (
              <p className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm">
                <strong>
                  {entero
                    ? `${proveedor} sale de la consulta.`
                    : `Se le quitan ${marcados.length} ${marcados.length === 1 ? "producto" : "productos"}.`}
                </strong>
                {preciosQueSePierden > 0
                  ? ` Se borran ${preciosQueSePierden} ${preciosQueSePierden === 1 ? "precio que ya dio" : "precios que ya dio"}, y eso no se deshace.`
                  : " No había apuntado ningún precio, así que no se pierde nada."}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={(marcados.length === 0 && !sinNada) || enCurso}
              onClick={() => {
                // Vacío = entero, que es lo que espera la acción. Mandar la
                // lista completa haría lo mismo, pero por el camino largo.
                onQuitar(entero ? [] : marcados);
                setAbierto(false);
              }}
              className="gap-1.5"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {enCurso
                ? "Quitando…"
                : entero
                  ? "Quitarlo de la consulta"
                  : `Quitarle ${marcados.length} ${marcados.length === 1 ? "producto" : "productos"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
