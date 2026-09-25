"use client";

import { Button, Input } from "@rodatech/ui";
import { Trash2 } from "lucide-react";

import {
  importeLinea,
  type Accion,
  type LineaCompraEditable,
} from "../../dominio/constructor";

/**
 * Una línea del registro de compra.
 *
 * Lo que se teclea es cantidad y costo. Lo demás se enseña para que el
 * operador se dé cuenta de que se ha equivocado ANTES de grabar: qué costaba
 * antes, qué le cobró este proveedor la última vez, y en cuánto queda el stock
 * cuando llegue.
 */
export function FilaCompra({
  linea,
  ultimoCosto,
  despachar,
}: {
  linea: LineaCompraEditable;
  /** Lo que ESTE proveedor cobró la última vez por este producto. */
  ultimoCosto: { costo: number; numero: string } | undefined;
  despachar: (a: Accion) => void;
}) {
  const stockResultante = linea.stockActual + linea.cantidad;
  const bajoMinimo = linea.stockMinimo > 0 && stockResultante < linea.stockMinimo;

  return (
    <tr className="border-b border-[var(--border-soft)] last:border-0">
      <td className="px-2 py-2">
        <span className="block font-mono text-[0.8rem] font-medium">{linea.codigo}</span>
        <span className="block text-sm text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      {/* `w-full max-w-0`: la única forma de que una celda de tabla ceda
          ancho. Con `max-w-xs` pedía siempre sus 340 px y empujaba el costo
          fuera de la vista. Dos renglones y no uno: «RODAMIENTO DE RODIL…»
          no dice qué rodamiento es. */}
      <td className="w-full max-w-0 px-2 py-2">
        <span className="line-clamp-2 text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
      </td>

      <td className="px-2 py-2">
        {/*
          ENTERA. No se compran 3,30 rodamientos.

          Luis, 21/09: *«la cantidad tiene que ser siempre entero, yo no puedo
          pedir cantidad 3.30, no, eso no»*. Admitía dos decimales desde
          siempre, y con ellos un 3,3 tecleado sin querer se convertía en una
          orden de compra que ningún proveedor sabe atender.

          Se redondea al vuelo en vez de rechazar: quien teclea un decimal aquí
          se equivocó de tecla, y un error que se corrige solo es mejor que uno
          que hay que leer.
        */}
        <Input
          type="number"
          min={0}
          step={1}
          value={linea.cantidad}
          onChange={(e) =>
            despachar({
              tipo: "cantidad",
              key: linea.key,
              valor: Math.round(Number(e.target.value)),
            })
          }
          className="w-24 text-right tabular"
          aria-label={`Cantidad a comprar de ${linea.codigo}`}
        />
      </td>

      <td className="px-2 py-2 text-sm text-[var(--fg-muted)]">{linea.unidad}</td>

      <td className="px-2 py-2">
        <Input
          type="number"
          min={0}
          step="0.0001"
          value={linea.costoUnitario}
          onChange={(e) =>
            despachar({ tipo: "costo", key: linea.key, valor: Number(e.target.value) })
          }
          className="w-28 text-right tabular"
          aria-label={`Costo unitario de ${linea.codigo}`}
        />
        <ReferenciaCosto linea={linea} ultimoCosto={ultimoCosto} />
      </td>

      <td className="px-2 py-2 text-right tabular text-sm font-medium">
        {importeLinea(linea).toFixed(2)}
      </td>

      <td className="px-2 py-2 text-right text-sm tabular">
        <span className="text-[var(--fg-muted)]">{linea.stockActual} → </span>
        <span className={bajoMinimo ? "font-medium text-[var(--warn)]" : "font-medium"}>
          {stockResultante}
        </span>
        {linea.stockMinimo > 0 ? (
          <span className="block text-[var(--fg-subtle)]">mín. {linea.stockMinimo}</span>
        ) : null}
      </td>

      <td className="px-2 py-2 text-right">
        {/* Un botón que parece botón: era un «Quitar» en gris de 12 px, sin
            borde, que Willy no habría reconocido como algo que se pulsa. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          aria-label={`Quitar ${linea.codigo} de la compra`}
          className="text-sm"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

/**
 * La misma línea, cuando la tabla no cabe.
 *
 * La tabla pide unos 800 px: en un teléfono, y también en un portátil con el
 * resumen al lado, había que deslizarla de lado para llegar al costo, que es
 * justo lo que se viene a escribir. Luis, 25/09:
 * *«cualquier módulo, cambio, tiene que ser 100 % responsivo, buen diseño y que
 * todo cuadre»*.
 *
 * Arriba lo que identifica al producto; en medio los dos campos que se
 * teclean, a lo ancho y con su nombre encima —en la tabla lo dice la
 * cabecera, aquí no hay cabecera—; abajo lo que resulta: importe y stock.
 */
export function TarjetaCompra({
  linea,
  ultimoCosto,
  despachar,
}: {
  linea: LineaCompraEditable;
  ultimoCosto: { costo: number; numero: string } | undefined;
  despachar: (a: Accion) => void;
}) {
  const stockResultante = linea.stockActual + linea.cantidad;
  const bajoMinimo = linea.stockMinimo > 0 && stockResultante < linea.stockMinimo;

  return (
    <li className="rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{linea.codigo}</p>
          <p className="text-sm">{linea.descripcion}</p>
          {linea.marca ? (
            <p className="text-sm text-[var(--fg-subtle)]">{linea.marca}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          aria-label={`Quitar ${linea.codigo} de la compra`}
          className="shrink-0 text-sm"
        >
          <Trash2 className="size-4" aria-hidden />
          Quitar
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cantidad ({linea.unidad})</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={linea.cantidad}
            onChange={(e) =>
              despachar({
                tipo: "cantidad",
                key: linea.key,
                valor: Math.round(Number(e.target.value)),
              })
            }
            className="text-right tabular"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Costo unitario</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.0001"
            value={linea.costoUnitario}
            onChange={(e) =>
              despachar({ tipo: "costo", key: linea.key, valor: Number(e.target.value) })
            }
            className="text-right tabular"
          />
          <ReferenciaCosto linea={linea} ultimoCosto={ultimoCosto} />
        </label>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--border-soft)] pt-2 text-sm">
        <p>
          <span className="text-[var(--fg-muted)]">Stock </span>
          <span className="tabular">{linea.stockActual} → </span>
          <span className={`tabular ${bajoMinimo ? "font-medium text-[var(--warn)]" : "font-medium"}`}>
            {stockResultante}
          </span>
          {linea.stockMinimo > 0 ? (
            <span className="text-[var(--fg-subtle)]"> · mín. {linea.stockMinimo}</span>
          ) : null}
        </p>
        <p className="text-right">
          <span className="text-[var(--fg-muted)]">Importe </span>
          <span className="tabular font-semibold">{importeLinea(linea).toFixed(2)}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * De dónde salió el costo que está escrito en el campo.
 *
 * La referencia útil no es el promedio del maestro, sino lo que ESTE
 * proveedor cobró la última vez: es contra lo que se negocia. Desde que se
 * rellena solo, lo que hay que decir es DE DÓNDE salió el número — un costo
 * propuesto no es un costo pactado, y quien registra tiene que poder
 * distinguirlos.
 *
 * «promedio» y «ficha» no son lo mismo y no se pueden llamar igual. El primero
 * es lo que de verdad se pagó, que mantiene el kardex; el segundo lo que
 * alguien anotó en el maestro, que es lo único que hay mientras el producto no
 * haya entrado nunca al almacén — o sea, en casi todo el catálogo.
 *
 * Una sola pieza para la fila y la tarjeta: si cada una lo dijera a su
 * manera, el mismo número tendría dos explicaciones.
 */
function ReferenciaCosto({
  linea,
  ultimoCosto,
}: {
  linea: LineaCompraEditable;
  ultimoCosto: { costo: number; numero: string } | undefined;
}) {
  if (ultimoCosto) {
    return (
      <span className="mt-0.5 block text-right text-sm text-[var(--fg-subtle)] tabular">
        {linea.costoPropuesto ? "de " : ""}
        {ultimoCosto.numero}: {ultimoCosto.costo.toFixed(4)}
      </span>
    );
  }
  if (linea.costoAnterior > 0) {
    return (
      <span className="mt-0.5 block text-right text-sm text-[var(--fg-subtle)] tabular">
        {linea.costoPropuesto ? (linea.costoDelKardex ? "del " : "de la ") : ""}
        {linea.costoDelKardex ? "promedio" : "ficha"} {linea.costoAnterior.toFixed(4)}
      </span>
    );
  }
  return null;
}
