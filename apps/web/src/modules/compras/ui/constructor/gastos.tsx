"use client";

import * as React from "react";
import { Button, Input } from "@rodatech/ui";
import { Plus, Trash2 } from "lucide-react";

import type { Accion } from "../../dominio/constructor";
import {
  AYUDA_MODALIDAD,
  CONCEPTOS_SUGERIDOS,
  ETIQUETA_MODALIDAD,
  totalGastos,
  type GastoEditable,
  type Modalidad,
} from "../../dominio/gastos";

/**
 * Los gastos de la compra, DETALLADOS y en las tres modalidades.
 *
 * Willy, 24/09 (§AO.4): *«yo quiero registrar todos los gastos que he
 * incurrido para que me llegue esa mercadería acá, para así poder establecer
 * cuál es mi costo real puesto acá»*.
 *
 * Hasta el 25/09 esto era UNA casilla, y solo en importación. La base ya
 * aguantaba el detalle —`gastos_importacion` desde la 002, sumado por la 022—
 * pero el alta no sabía escribirlo. Ahora cada gasto es una fila: se ve qué
 * se pagó y por qué, y todos entran al costo al recibir.
 *
 * ---------------------------------------------------------------------------
 * Por qué las filas vienen PUESTAS, vacías
 * ---------------------------------------------------------------------------
 * Al elegir «marítima» aparecen flete, aduana, ajuste de valor, almacenaje,
 * levante, agente y traslado, sin monto. No es relleno: es la lista de lo que
 * suele haber, para que no se olvide ninguno. *«Hay un montón de cositas»*.
 * Lo que se deja en cero no se guarda.
 */
export function GastosDeCompra({
  modalidad,
  gastos,
  moneda,
  despachar,
}: {
  modalidad: Modalidad;
  gastos: GastoEditable[];
  moneda: string;
  despachar: (a: Accion) => void;
}) {
  const total = totalGastos(gastos);
  const simbolo = moneda === "PEN" ? "S/" : "$";

  // Lo que se propone y todavía no está en la lista, para añadirlo de un clic
  // si se quitó sin querer.
  const faltan = CONCEPTOS_SUGERIDOS[modalidad].filter(
    (c) => !gastos.some((g) => g.concepto === c),
  );

  return (
    <section className="card p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">
          Gastos · {ETIQUETA_MODALIDAD[modalidad].toLowerCase()}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{AYUDA_MODALIDAD[modalidad]}</p>
      </div>

      {gastos.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--fg-muted)]">
          Sin gastos. Si no pagaste nada aparte de la mercadería, está bien así.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {gastos.map((g) => (
            <li
              key={g.key}
              className="grid grid-cols-[1fr_8rem_auto] items-center gap-2"
            >
              <Input
                value={g.concepto}
                onChange={(e) =>
                  despachar({ tipo: "gastoConcepto", key: g.key, valor: e.target.value })
                }
                placeholder="Qué se pagó"
                aria-label="Concepto del gasto"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                // Vacío en vez de «0»: un cero escrito parece un dato, y aquí
                // significa «no hubo».
                value={g.monto > 0 ? g.monto : ""}
                onChange={(e) =>
                  despachar({ tipo: "gastoMonto", key: g.key, valor: Number(e.target.value) })
                }
                placeholder="0.00"
                className="text-right tabular"
                aria-label={`Monto de ${g.concepto || "este gasto"}`}
              />
              {/* Un botón que parece botón, con su icono: el de las líneas
                  era un «Quitar» en gris de 12 px. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => despachar({ tipo: "gastoQuitar", key: g.key })}
                aria-label={`Quitar ${g.concepto || "este gasto"}`}
                className="text-sm"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => despachar({ tipo: "gastoAgregar" })}
          className="text-sm"
        >
          <Plus className="size-4" aria-hidden />
          Otro gasto
        </Button>
        {faltan.map((c) => (
          <Button
            key={c}
            type="button"
            variant="subtle"
            size="sm"
            onClick={() => despachar({ tipo: "gastoAgregar", concepto: c })}
            className="text-sm"
          >
            <Plus className="size-4" aria-hidden />
            {c}
          </Button>
        ))}

        <span className="ml-auto text-sm">
          <span className="text-[var(--fg-muted)]">Total de gastos </span>
          <span className="tabular font-semibold">
            {simbolo} {total.toFixed(2)}
          </span>
        </span>
      </div>

      {total > 0 ? (
        <p className="mt-2 text-sm text-[var(--fg-subtle)]">
          Se reparten sobre el costo de cada producto al recibir la mercadería, en
          proporción a lo que vale cada uno.
        </p>
      ) : null}
    </section>
  );
}
