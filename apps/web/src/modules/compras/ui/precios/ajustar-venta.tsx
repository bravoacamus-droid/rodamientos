"use client";

import * as React from "react";
import { Button, Campo, Input, formatearMoneda } from "@rodatech/ui";

import { ajustarPreciosDeVenta } from "@/modules/productos/acciones/precios";

import { margenSi, type Referencia } from "../../dominio/referencia";

/**
 * Ahora que sabes lo que te cuesta, decide a cuánto lo vendes.
 *
 * ---------------------------------------------------------------------------
 * Por qué aquí y no en la ficha del producto
 * ---------------------------------------------------------------------------
 * Luis: *«la idea es que tenga otro campo card del producto que me traiga el
 * precio de compra más barato, y poder editar el precio de venta y el precio
 * mínimo de venta si es que quiere cambiar o se queda igual»*. Y antes: *«todo
 * manda desde compras»*.
 *
 * El momento en que se sabe a cuánto sale de verdad un rodamiento es cuando el
 * proveedor contesta — y es exactamente el momento de decidir a cuánto se
 * vende. Obligar a apuntar el costo, salir a la ficha y volver es garantizar
 * que no se haga: el precio de venta se queda con el del año pasado y la
 * inflación se come el margen en silencio.
 *
 * ---------------------------------------------------------------------------
 * Los colores dicen cuál es cuál
 * ---------------------------------------------------------------------------
 * *«ahí ese card de dos con colores, así diferencia cuál es más barato o más
 * caro»*. Verde el más barato, rojo el más caro — y solo cuando hay DOS o más
 * precios: con uno solo no hay nada que comparar, y pintarlo de verde diría
 * que es bueno cuando es simplemente el único.
 */
export function AjustarVenta({
  productoId,
  codigo,
  descripcion,
  referencia,
  /** Lo que contestaron en esta ronda, en USD sin IGV. */
  ofertas,
}: {
  productoId: string;
  codigo: string;
  descripcion: string;
  referencia: Referencia;
  ofertas: { proveedor: string; costoUsd: number }[];
}) {
  const [venta, setVenta] = React.useState(
    referencia.precioVenta === null ? "" : String(referencia.precioVenta),
  );
  const [piso, setPiso] = React.useState(
    referencia.precioMinimo === null ? "" : String(referencia.precioMinimo),
  );

  /*
    Lo que hay guardado ahora mismo, para poder volver.

    Luis: *«si cambio el precio pero ya no quiero, y no me acuerdo el precio de
    compra, ¿cómo sería?»*. Y es verdad: se teclea encima del precio de venta,
    el número anterior desaparece de la pantalla y no queda ni rastro. La única
    salida era recargar y perder el resto.

    Se guarda aparte y no se lee de `referencia` en cada render porque después
    de guardar `referencia` sigue trayendo el valor viejo hasta que el servidor
    devuelva la página: el «vuelve a» ofrecería deshacer lo que se acaba de
    hacer a propósito.
  */
  const [original, setOriginal] = React.useState({
    venta: referencia.precioVenta === null ? "" : String(referencia.precioVenta),
    piso: referencia.precioMinimo === null ? "" : String(referencia.precioMinimo),
  });
  const [guardado, setGuardado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enCurso, empezar] = React.useTransition();

  const ordenadas = [...ofertas].sort((a, b) => a.costoUsd - b.costoUsd);
  const barata = ordenadas[0];
  const cara = ordenadas.length > 1 ? ordenadas[ordenadas.length - 1] : null;

  // El costo con el que se calcula el margen: lo que costaría comprarlo HOY,
  // no lo que costó la última vez. Es la cifra sobre la que se decide.
  const costo = barata?.costoUsd ?? referencia.ultimoCosto;
  const ventaNum = venta.trim() === "" ? 0 : Number(venta);
  const margen = margenSi(costo, Number.isFinite(ventaNum) ? ventaNum : 0);

  const cambiado = venta !== original.venta || piso !== original.piso;

  function guardar() {
    setError(null);
    setGuardado(false);
    const v = venta.trim() === "" ? 0 : Number(venta);
    const p = piso.trim() === "" ? 0 : Number(piso);
    if (!Number.isFinite(v) || !Number.isFinite(p)) {
      setError("Alguno de los dos no es un número.");
      return;
    }
    empezar(async () => {
      const r = await ajustarPreciosDeVenta({
        producto_id: productoId,
        precio_venta: v,
        precio_minimo: p,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOriginal({ venta, piso });
      setGuardado(true);
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <span className="font-mono text-base font-semibold">{codigo}</span>
        <p className="text-sm text-[var(--fg-muted)]">{descripcion}</p>
      </div>

      {/* Lo que te cuesta. Con dos o más, en dos colores. */}
      <div className="flex flex-wrap gap-2">
        {barata ? (
          <span
            className={`flex min-w-0 flex-1 flex-col rounded-md px-3 py-2 ${
              cara
                ? "bg-[var(--ok-bg)] text-[var(--ok)]"
                : "bg-[var(--surface-2)]"
            }`}
          >
            <span className="text-sm opacity-80">
              {cara ? "El más barato" : "Te lo dejan a"}
            </span>
            <strong className="text-lg tabular-nums">
              {formatearMoneda(barata.costoUsd, "USD")}
            </strong>
            <span className="truncate text-sm opacity-80">{barata.proveedor}</span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col rounded-md bg-[var(--surface-2)] px-3 py-2">
            <span className="text-sm text-[var(--fg-subtle)]">Te lo dejan a</span>
            <strong className="text-lg text-[var(--fg-subtle)]">—</strong>
            <span className="text-sm text-[var(--fg-subtle)]">nadie ha contestado</span>
          </span>
        )}

        {cara ? (
          <span className="flex min-w-0 flex-1 flex-col rounded-md bg-[var(--danger-bg)] px-3 py-2 text-[var(--danger)]">
            <span className="text-sm opacity-80">El más caro</span>
            <strong className="text-lg tabular-nums">
              {formatearMoneda(cara.costoUsd, "USD")}
            </strong>
            <span className="truncate text-sm opacity-80">{cara.proveedor}</span>
          </span>
        ) : null}
      </div>

      {/* Y a cuánto lo vendes. Editable aquí mismo. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Campo
          id={`venta-${productoId}`}
          label="Precio de venta ($)"
          /*
            Lo que hay guardado, y cómo volver.

            Luis: *«si cambio el precio pero ya no quiero, y no me acuerdo el
            precio, ¿cómo sería?»*. Se teclea encima y el número anterior
            desaparece sin dejar rastro; la única salida era recargar la página
            y perder todo lo demás.

            Solo sale cuando de verdad hay algo que deshacer: enseñar «ahora
            está en 3.48» debajo de un campo que pone 3.48 es ruido.
          */
          ayuda={
            venta !== original.venta ? (
              <>
                Ahora está en{" "}
                <strong>{original.venta === "" ? "—" : `$${original.venta}`}</strong>.{" "}
                <button
                  type="button"
                  className="text-brand-600 underline"
                  onClick={() => {
                    setVenta(original.venta);
                    setGuardado(false);
                  }}
                >
                  Volver a ese
                </button>
              </>
            ) : undefined
          }
        >
          <Input
            id={`venta-${productoId}`}
            inputMode="decimal"
            className="text-right tabular-nums"
            value={venta}
            onChange={(e) => {
              setVenta(e.target.value);
              setGuardado(false);
            }}
          />
        </Campo>
        <Campo
          id={`piso-${productoId}`}
          label="Precio mínimo de venta ($)"
          ayuda="Lo más barato que aceptas venderlo. 0 = sin mínimo."
        >
          <Input
            id={`piso-${productoId}`}
            inputMode="decimal"
            className="text-right tabular-nums"
            value={piso}
            onChange={(e) => {
              setPiso(e.target.value);
              setGuardado(false);
            }}
          />
        </Campo>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={guardar}
            disabled={enCurso || !cambiado}
            variant={cambiado ? "primary" : "outline"}
          >
            {enCurso ? "Guardando…" : guardado ? "Guardado" : "Guardar"}
          </Button>
        </div>
      </div>

      <p className="text-sm">
        {margen !== null ? (
          <>
            <span className="text-[var(--fg-muted)]">Con estos números te queda un </span>
            <strong className={margen < 10 ? "text-[var(--warn)]" : ""}>
              {margen}% de margen
            </strong>
            <span className="text-[var(--fg-muted)]"> sobre el costo.</span>
          </>
        ) : (
          <span className="text-[var(--fg-muted)]">
            El margen sale cuando haya un costo y un precio de venta.
          </span>
        )}
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2.5 text-sm"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
