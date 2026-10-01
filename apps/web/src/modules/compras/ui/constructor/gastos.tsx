"use client";

import * as React from "react";
import { Button, Input } from "@rodatech/ui";
import { Plus, Scale, Trash2 } from "lucide-react";

import type { Accion } from "../../dominio/constructor";
import {
  AYUDA_MODALIDAD,
  CONCEPTOS_SUGERIDOS,
  ETIQUETA_MODALIDAD,
  ETIQUETA_REPARTO,
  totalGastos,
  type CosteoEstimado,
  type GastoEditable,
  type Modalidad,
  type Reparto,
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
 *
 * ---------------------------------------------------------------------------
 * Y cada gasto dice cómo se reparte (097)
 * ---------------------------------------------------------------------------
 * Willy, 01/10 (§AP): *«el costo de DHL […] lo divido entre el peso total
 * calculado y me sale un factor $/kg»*. El courier va por kilo; impuestos y
 * desaduanaje, por valor. Se propone según el concepto y se cambia con un
 * botón: dos botones a la vista y no un desplegable, porque es una decisión
 * de dos opciones y las dos tienen que leerse sin abrir nada.
 */
export function GastosDeCompra({
  modalidad,
  gastos,
  moneda,
  costeo,
  despachar,
}: {
  modalidad: Modalidad;
  gastos: GastoEditable[];
  moneda: string;
  costeo: CosteoEstimado;
  despachar: (a: Accion) => void;
}) {
  const total = totalGastos(gastos);
  const simbolo = moneda === "PEN" ? "S/" : "$";
  const dinero = (n: number) => `${simbolo} ${n.toFixed(2)}`;

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
            // En el teléfono, el concepto en su fila y debajo monto, reparto y
            // papelera; desde `sm`, todo en una. Cada gasto en su recuadro en
            // el teléfono para que se vea qué monto es de qué concepto.
            <li
              key={g.key}
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-[var(--border-soft)] p-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:border-0 sm:p-0"
            >
              <Input
                className="col-span-2 sm:col-span-1"
                value={g.concepto}
                onChange={(e) =>
                  despachar({ tipo: "gastoConcepto", key: g.key, valor: e.target.value })
                }
                placeholder="Qué se pagó"
                aria-label="Concepto del gasto"
              />
              <Input
                type="number"
                inputMode="decimal"
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
              <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <SelectorReparto
                  valor={g.reparto}
                  concepto={g.concepto}
                  onCambiar={(r) => despachar({ tipo: "gastoReparto", key: g.key, valor: r })}
                />
                {/* Un botón que parece botón, con su icono. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => despachar({ tipo: "gastoQuitar", key: g.key })}
                  aria-label={`Quitar ${g.concepto || "este gasto"}`}
                  title={`Quitar ${g.concepto || "este gasto"}`}
                  className="ml-auto h-10 text-sm sm:ml-0"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </span>
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
          <span className="tabular font-semibold">{dinero(total)}</span>
        </span>
      </div>

      {/*
        La cuenta del Excel, a la vista: «DHL ÷ kilos = $ por kilo». Es la
        cifra con la que Willy piensa —su celda «$/Kg.»—, y verla aquí es lo
        que le dice que el sistema calcula como él.
      */}
      {costeo.repartePorPeso ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-[var(--surface-2)] p-3 text-sm">
          <Scale className="size-4 shrink-0 text-[var(--fg-muted)]" aria-hidden />
          <span>
            Por kilo: <span className="tabular font-semibold">{dinero(costeo.gastosPorPeso)}</span>
            <span className="text-[var(--fg-muted)]"> ÷ </span>
            <span className="tabular font-semibold">{costeo.kilos.toFixed(2)} kg</span>
            <span className="text-[var(--fg-muted)]"> = </span>
            <span className="tabular font-semibold">{dinero(costeo.porKg)} por kilo</span>
          </span>
        </p>
      ) : null}

      {total > 0 ? (
        <p className="mt-2 text-sm text-[var(--fg-subtle)]">
          Al recibir la mercadería entran al costo de cada producto: lo que va «por kilo»,
          según lo que pesa; lo que va «por valor», según lo que vale.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Dos botones, uno marcado. Se leen los dos sin abrir nada, y el marcado se
 * distingue por el relleno y no solo por el color.
 */
export function SelectorReparto({
  valor,
  concepto,
  onCambiar,
}: {
  valor: Reparto;
  concepto: string;
  onCambiar: (r: Reparto) => void;
}) {
  return (
    <span
      role="group"
      aria-label={`Cómo se reparte ${concepto || "este gasto"}`}
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-[var(--border)]"
    >
      {(["peso", "valor"] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={valor === r}
          onClick={() => onCambiar(r)}
          className={`h-10 px-3 text-sm font-medium transition-colors first:border-r first:border-[var(--border)] ${
            valor === r
              ? "bg-brand-600 text-white"
              : "bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-2)]"
          }`}
        >
          {ETIQUETA_REPARTO[r]}
        </button>
      ))}
    </span>
  );
}
