"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { ArrowLeftRight, FileText, X } from "lucide-react";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETIQUETA_MOVIMIENTO } from "../dominio/tipos";

const ORIGENES = [
  { valor: "recepcion", etiqueta: "Recepción" },
  { valor: "comprobante", etiqueta: "Comprobante" },
  { valor: "guia", etiqueta: "Guía" },
  { valor: "ajuste", etiqueta: "Ajuste" },
  { valor: "compra", etiqueta: "Compra" },
  { valor: "importacion", etiqueta: "Carga inicial" },
];

/**
 * El kárdex (13/10): el periodo arriba y una fila debajo, como el resto de
 * listas. El producto no es un desplegable —con 2.000+ códigos no cabe—: se
 * llega a él desde el catálogo o pinchando un código, y aquí solo se enseña
 * cuál está puesto y cómo quitarlo.
 */
export function FiltrosKardexBarra({ productoActivo }: { productoActivo: string | null }) {
  const { valor, aplicar, limpiar } = useBarraFiltros();
  const hay = ["producto", "tipo", "referencia", "desde", "hasta"].some((k) => valor(k));

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <BarraPeriodo />
      <FilaFiltros>
        {productoActivo ? (
          <button
            type="button"
            onClick={() => aplicar("producto", "")}
            className="inline-flex h-control-md items-center gap-2 rounded-md border border-brand-300 bg-brand-50 px-3 text-sm font-medium hover:bg-[var(--surface-2)] dark:bg-brand-950"
          >
            <span className="font-mono">{productoActivo}</span>
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Quitar el filtro de producto</span>
          </button>
        ) : null}
        <FiltroDesplegable
          icono={ArrowLeftRight}
          etiqueta="Movimiento"
          todos="Movimiento: todos"
          valor={valor("tipo")}
          opciones={Object.entries(ETIQUETA_MOVIMIENTO).map(([v, t]) => ({ valor: v, etiqueta: t }))}
          onCambiar={(v) => aplicar("tipo", v)}
        />
        <FiltroDesplegable
          icono={FileText}
          etiqueta="Origen"
          todos="Origen: todos"
          valor={valor("referencia")}
          opciones={ORIGENES}
          onCambiar={(v) => aplicar("referencia", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
