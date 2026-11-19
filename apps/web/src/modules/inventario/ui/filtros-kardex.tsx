"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import * as React from "react";
import { ArrowLeftRight, FileText, X } from "lucide-react";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import { ORIGENES_KARDEX } from "../dominio/filtros-kardex";
import { ETIQUETA_MOVIMIENTO } from "../dominio/tipos";

interface Opcion {
  id: string;
  nombre: string;
}

/**
 * Los filtros del kárdex.
 *
 * Luis, 19/11: *«tenemos que poner más filtros profesionales, como también
 * buscar por producto, porque si no, ¿cómo sé qué producto?»*. Hasta ese día
 * el producto solo se ponía llegando desde el catálogo. Ahora:
 *
 *  · una caja que busca por código, código de fábrica, descripción o número
 *    del documento (la guía, la recepción, el ajuste);
 *  · familia, subfamilia y marca, con buscador, como en Productos;
 *  · movimiento, origen y quién lo hizo.
 *
 * Pinchar un código en la tabla sigue dejando el kardex de ESE producto, con
 * su saldo inicial y final arriba.
 */
export function FiltrosKardexBarra({
  productoActivo,
  familias,
  subfamilias,
  marcas,
  usuarios,
}: {
  productoActivo: string | null;
  familias: Opcion[];
  subfamilias: (Opcion & { familia_id: string })[];
  marcas: Opcion[];
  usuarios: Opcion[];
}) {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const familia = valor("familia");
  const hay = ["producto", "q", "familia", "subfamilia", "marca", "usuario", "tipo", "referencia", "desde", "hasta"].some(
    (k) => valor(k),
  );

  // Con una familia elegida, solo sus subfamilias.
  const subfamiliasVisibles = React.useMemo(
    () => (familia ? subfamilias.filter((s) => s.familia_id === familia) : subfamilias),
    [familia, subfamilias],
  );

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
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Buscar código, descripción o documento…"
          etiqueta="Buscar en el kardex"
        />
        <FiltroBuscable
          id="k-familia"
          etiqueta="Familia"
          todos="Todas las familias"
          buscar="Rodamiento, retén…"
          valor={familia}
          opciones={familias.map((f) => ({ valor: f.id, etiqueta: f.nombre }))}
          // Cambiar de familia invalida la subfamilia elegida.
          onCambiar={(v) => aplicarVarios({ familia: v, subfamilia: "" })}
        />
        <FiltroBuscable
          id="k-subfamilia"
          etiqueta="Subfamilia"
          todos="Todas las subfamilias"
          buscar="Rígido de bolas, cónicos…"
          valor={valor("subfamilia")}
          opciones={subfamiliasVisibles.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
          onCambiar={(v) => aplicar("subfamilia", v)}
        />
        <FiltroBuscable
          id="k-marca"
          etiqueta="Marca"
          todos="Todas las marcas"
          buscar="SKF, FAG, NTN…"
          valor={valor("marca")}
          opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          onCambiar={(v) => aplicar("marca", v)}
        />
      </FilaFiltros>
      <FilaFiltros>
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
          opciones={ORIGENES_KARDEX}
          onCambiar={(v) => aplicar("referencia", v)}
        />
        <FiltroBuscable
          id="k-usuario"
          etiqueta="Hecho por"
          todos="Hecho por: todos"
          buscar="Nombre…"
          valor={valor("usuario")}
          opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
          onCambiar={(v) => aplicar("usuario", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
