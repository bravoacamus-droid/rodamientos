"use client";

import { Input } from "@rodatech/ui";

import type { Accion, LineaRecibida } from "../../dominio/constructor";
import type { LineaCosteada } from "../../dominio/costeo";

/**
 * Una línea del registro de recepción.
 *
 * Lo que se teclea es cantidad y costo. Todo lo demás —el costo con gastos
 * prorrateados, el stock resultante— se calcula y se enseña, porque es lo que
 * el operador necesita para darse cuenta de que se ha equivocado ANTES de
 * grabar. Después de grabar, corregir un ingreso de kardex ya no es un botón:
 * es un ajuste de gerencia con su documento.
 */
export function FilaRecepcion({
  linea,
  costeada,
  conGastos,
  despachar,
}: {
  linea: LineaRecibida;
  costeada: LineaCosteada | undefined;
  /** Si la recepción arrastra gastos, se enseña la columna del costo final. */
  conGastos: boolean;
  despachar: (a: Accion) => void;
}) {
  const stockResultante = linea.stockAnterior + linea.cantidad;

  return (
    <tr className="border-b border-[var(--border-soft)] last:border-0">
      <td className="px-2 py-2">
        <span className="block font-mono text-[0.8rem] font-medium">{linea.codigo}</span>
        <span className="block text-xs text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      <td className="max-w-xs px-2 py-2">
        <span className="block truncate text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
        {linea.pendiente !== null ? (
          <span className="block text-xs text-[var(--fg-subtle)]">
            la compra esperaba {linea.pendiente} {linea.unidad}
          </span>
        ) : null}
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
          aria-label={`Cantidad recibida de ${linea.codigo}`}
        />
      </td>

      <td className="px-2 py-2 text-xs text-[var(--fg-muted)]">{linea.unidad}</td>

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
        {linea.costoAnterior > 0 ? (
          <span className="mt-0.5 block text-right text-xs text-[var(--fg-subtle)]">
            antes {linea.costoAnterior}
          </span>
        ) : null}
      </td>

      <td className="px-2 py-2 text-right tabular text-sm">
        {(costeada?.importe ?? 0).toFixed(2)}
      </td>

      {conGastos ? (
        <td className="px-2 py-2 text-right">
          {/* El costo que de verdad va a entrar al kardex. Es el número del
              que sale el costo promedio, y por tanto el margen de todo lo que
              se venda después. */}
          <span className="block tabular text-sm font-medium">
            {(costeada?.costoFinal ?? 0).toFixed(4)}
          </span>
          <span className="block text-xs text-[var(--fg-subtle)] tabular">
            {(costeada?.importeFinal ?? 0).toFixed(2)}
          </span>
        </td>
      ) : null}

      <td className="px-2 py-2 text-right text-xs text-[var(--fg-muted)] tabular">
        {linea.stockAnterior} → <span className="font-medium text-[var(--fg)]">{stockResultante}</span>
      </td>

      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          className="rounded-sm px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
          aria-label={`Quitar ${linea.codigo} de la recepción`}
        >
          Quitar
        </button>
      </td>
    </tr>
  );
}
