"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import {
  Badge,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableContenedor,
  TBody,
  THead,
} from "@rodatech/ui";

import type { KitDetalle } from "../../api/kits";

const dolar = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "USD" });

/*
  Los dos botones de la columna de acciones.

  Luis, 17/09: *«estamos trabajando con botón de "ver" así, ¿por qué no tenemos
  los botones necesarios, ver, editar?»*. Y es la regla de la primera página:
  un botón tiene que parecer un botón. Tener el código como enlace —que era lo
  que había— obliga a descubrir que se puede pulsar.

  Las clases se copian de la tabla de cotizaciones a propósito: la misma
  pantalla en dos módulos tiene que verse igual, y ahí ya están medidas —36 px
  de alto y `text-sm`, el mínimo con el que un botón sigue leyéndose dentro de
  una fila.
*/
const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/**
 * «Ver» y «Editar» de un kit.
 *
 * ---------------------------------------------------------------------------
 * Por qué «Ver» abre un diálogo y no otra pantalla
 * ---------------------------------------------------------------------------
 * Porque es lo que pidió Willy, 16/09 (16:26): *«le puedo hacer un botón de
 * ver, y usted va a poder ver toda la lista, todo lo que contiene»*. Lo que se
 * quiere saber de un kit es qué lleva dentro, y eso se consulta de pasada —
 * mientras se cotiza, mientras se decide si se puede prometer—, no se «visita».
 *
 * Una pantalla aparte obligaría a ir y volver para comparar dos kits. Con un
 * diálogo se cierra y se abre el siguiente.
 */
export function AccionesKit({ kit }: { kit: KitDetalle }) {
  const [viendo, setViendo] = React.useState(false);

  return (
    <>
      <span className="inline-flex items-center justify-end gap-1.5">
        <button type="button" onClick={() => setViendo(true)} className={SECUNDARIO}>
          <Eye className="size-4 shrink-0" />
          Ver
        </button>
        <Link href={`/productos/kits/${kit.id}`} className={SECUNDARIO}>
          <Pencil className="size-4 shrink-0" />
          Editar
        </Link>
      </span>

      <Dialog open={viendo} onOpenChange={setViendo}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{kit.codigo}</DialogTitle>
            <DialogDescription>{kit.descripcion}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            {/* Lo que se viene a saber, arriba: si se puede prometer y a
                cuánto. El detalle de las piezas es la explicación. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <span className="text-sm">
                Se pueden armar
                <span className="ml-2 tabular text-2xl font-semibold">
                  {kit.armable}
                </span>
                {kit.armable <= 0 ? (
                  <Badge tone="danger" size="xs" className="ml-2">
                    falta material
                  </Badge>
                ) : null}
              </span>
              <span className="text-right text-sm">
                <span className="block text-[var(--fg-muted)]">Se vende a</span>
                <span className="tabular text-xl font-semibold">
                  {dolar(kit.precioVenta)}
                </span>
                {Math.abs(kit.precioVenta - kit.sumaVenta) >= 0.01 ? (
                  <span className="block text-sm text-[var(--fg-muted)]">
                    la suma de las piezas es {dolar(kit.sumaVenta)}
                  </span>
                ) : null}
              </span>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Qué lleva dentro</h3>
              <TableContenedor>
                <Table>
                  <THead>
                    <tr>
                      <th className="text-left">Código</th>
                      <th className="text-left">Descripción</th>
                      <th className="text-right">Lleva</th>
                      <th className="text-right">Hay</th>
                      <th className="text-right">Alcanza para</th>
                    </tr>
                  </THead>
                  <TBody>
                    {kit.componentes.map((c) => {
                      // El que limita al kit entero se marca: es la respuesta
                      // a «¿por qué solo puedo armar 3?».
                      const frena =
                        kit.componentes.length > 1 && c.alcanzaPara === kit.armable;
                      return (
                        <tr key={c.producto_id}>
                          <td className="whitespace-nowrap font-medium">{c.codigo}</td>
                          <td className="text-sm">{c.descripcion}</td>
                          <td className="text-right tabular text-sm">
                            {c.cantidad} {c.unidad}
                          </td>
                          <td className="text-right tabular text-sm">{c.stock}</td>
                          <td
                            className={`text-right tabular text-sm ${
                              frena ? "font-semibold text-[var(--warn)]" : ""
                            }`}
                            title={
                              frena
                                ? "Es el que limita cuántos kits se pueden armar"
                                : undefined
                            }
                          >
                            {c.alcanzaPara}
                          </td>
                        </tr>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContenedor>
            </div>

            {/* Los precios de las piezas NO salen aquí, y es deliberado: esto
                es lo mismo que se enseña al cliente en el papel, y Willy fue
                explícito — «no precios detallados por cada parte». El costo y
                el margen se ven al editar, que es donde se decide. */}
            <p className="text-sm text-[var(--fg-subtle)]">
              Para cambiar lo que lleva o su precio, entra con{" "}
              <strong>Editar</strong>.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
