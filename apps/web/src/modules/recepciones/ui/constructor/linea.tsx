"use client";

// «NIU» es el código de SUNAT; en la tienda se dice «UND» (revisión por módulos del 02/10).
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";
import { Button, Input } from "@rodatech/ui";
import { Trash2 } from "lucide-react";

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
        <span className="block font-mono text-sm font-medium">{linea.codigo}</span>
        <span className="block text-sm text-[var(--fg-subtle)]">{linea.marca}</span>
      </td>

      <td className="max-w-xs px-2 py-2">
        <span className="block truncate text-sm" title={linea.descripcion}>
          {linea.descripcion}
        </span>
        {linea.pendiente !== null ? (
          <span className="block text-sm text-[var(--fg-subtle)]">
            la compra esperaba {linea.pendiente} {unidadLegible(linea.unidad)}
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

      <td className="px-2 py-2 text-sm text-[var(--fg-muted)]">{unidadLegible(linea.unidad)}</td>

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
          <span className="mt-0.5 block text-right text-sm text-[var(--fg-subtle)]">
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
          <span className="block text-sm text-[var(--fg-subtle)] tabular">
            {(costeada?.importeFinal ?? 0).toFixed(2)}
          </span>
        </td>
      ) : null}

      <td className="px-2 py-2 text-right text-sm text-[var(--fg-muted)] tabular">
        {linea.stockAnterior} → <span className="font-medium text-[var(--fg)]">{stockResultante}</span>
      </td>

      <td className="px-2 py-2 text-right">
        {/* Un botón que parece botón: era un «Quitar» gris de 12 px, sin
            borde — el mismo que se cambió en compras el 25/09. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          aria-label={`Quitar ${linea.codigo} de la recepción`}
          title={`Quitar ${linea.codigo} de la recepción`}
          className="gap-1 text-sm"
        >
          {/* Con su palabra (revisión por módulos del 02/10). */}
          <Trash2 className="size-4" aria-hidden />
          Quitar
        </Button>
      </td>
    </tr>
  );
}

/**
 * La misma línea, cuando la tabla no cabe.
 *
 * Revisión por módulos del 02/10: la recepción era la única pantalla de
 * alta sin tarjetas. A 390 la tabla pedía unos 800 px y había que deslizarla
 * de lado para llegar al costo y al botón de quitar. Es la misma tarjeta que
 * la de la compra: arriba el producto, en medio los dos campos que se
 * teclean con su nombre encima, y abajo lo que resulta.
 */
export function TarjetaRecepcion({
  linea,
  costeada,
  conGastos,
  despachar,
}: {
  linea: LineaRecibida;
  costeada: LineaCosteada | undefined;
  conGastos: boolean;
  despachar: (a: Accion) => void;
}) {
  const stockResultante = linea.stockAnterior + linea.cantidad;
  const unidad = unidadLegible(linea.unidad);

  return (
    <li className="rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{linea.codigo}</p>
          <p className="text-sm">{linea.descripcion}</p>
          {linea.marca ? (
            <p className="text-sm text-[var(--fg-subtle)]">{linea.marca}</p>
          ) : null}
          {linea.pendiente !== null ? (
            <p className="text-sm text-[var(--fg-subtle)]">
              la compra esperaba {linea.pendiente} {unidad}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => despachar({ tipo: "quitar", key: linea.key })}
          aria-label={`Quitar ${linea.codigo} de la recepción`}
          className="shrink-0 gap-1 text-sm"
        >
          <Trash2 className="size-4" aria-hidden />
          Quitar
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cantidad ({unidad})</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={linea.cantidad}
            onChange={(e) =>
              despachar({ tipo: "cantidad", key: linea.key, valor: Number(e.target.value) })
            }
            className="text-right tabular"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Costo unitario</span>
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={linea.costoUnitario}
            onChange={(e) =>
              despachar({ tipo: "costo", key: linea.key, valor: Number(e.target.value) })
            }
            className="text-right tabular"
          />
          {linea.costoAnterior > 0 ? (
            <span className="text-right text-sm text-[var(--fg-subtle)] tabular">
              antes {linea.costoAnterior}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--border-soft)] pt-2 text-sm">
        <p>
          <span className="text-[var(--fg-muted)]">Stock </span>
          <span className="tabular">{linea.stockAnterior} → </span>
          <span className="tabular font-medium">{stockResultante}</span>
        </p>
        <p className="text-right">
          <span className="text-[var(--fg-muted)]">Importe </span>
          <span className="tabular font-semibold">{(costeada?.importe ?? 0).toFixed(2)}</span>
        </p>
      </div>
      {conGastos ? (
        <p className="mt-1 text-right text-sm">
          <span className="text-[var(--fg-muted)]">Con gastos, al kardex </span>
          <span className="tabular font-semibold">
            {(costeada?.costoFinal ?? 0).toFixed(4)}
          </span>
          <span className="text-[var(--fg-muted)]"> c/u</span>
        </p>
      ) : null}
    </li>
  );
}
