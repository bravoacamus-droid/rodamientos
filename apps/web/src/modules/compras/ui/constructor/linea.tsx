"use client";

import { Input } from "@rodatech/ui";

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
        <span className="block text-[0.7rem] text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      <td className="max-w-xs px-2 py-2">
        <span className="block truncate text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
      </td>

      <td className="px-2 py-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={linea.cantidad}
          onChange={(e) =>
            despachar({ tipo: "cantidad", key: linea.key, valor: Number(e.target.value) })
          }
          className="w-24 text-right tabular"
          aria-label={`Cantidad a comprar de ${linea.codigo}`}
        />
      </td>

      <td className="px-2 py-2 text-[0.7rem] text-[var(--fg-muted)]">{linea.unidad}</td>

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
        {/* La referencia útil no es el promedio del maestro, sino lo que ESTE
            proveedor cobró la última vez: es contra lo que se negocia. */}
        {ultimoCosto ? (
          <span className="mt-0.5 block text-right text-[0.7rem] text-[var(--fg-subtle)] tabular">
            {ultimoCosto.numero}: {ultimoCosto.costo.toFixed(4)}
          </span>
        ) : linea.costoAnterior > 0 ? (
          <span className="mt-0.5 block text-right text-[0.7rem] text-[var(--fg-subtle)] tabular">
            promedio {linea.costoAnterior.toFixed(4)}
          </span>
        ) : null}
      </td>

      <td className="px-2 py-2 text-right tabular text-sm font-medium">
        {importeLinea(linea).toFixed(2)}
      </td>

      <td className="px-2 py-2 text-right text-[0.7rem] tabular">
        <span className="text-[var(--fg-muted)]">{linea.stockActual} → </span>
        <span className={bajoMinimo ? "font-medium text-[var(--warn)]" : "font-medium"}>
          {stockResultante}
        </span>
        {linea.stockMinimo > 0 ? (
          <span className="block text-[var(--fg-subtle)]">mín. {linea.stockMinimo}</span>
        ) : null}
      </td>

      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          className="rounded-sm px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
          aria-label={`Quitar ${linea.codigo} de la compra`}
        >
          Quitar
        </button>
      </td>
    </tr>
  );
}
