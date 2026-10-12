"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import * as React from "react";
import { Eye } from "lucide-react";

import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import type { Opcion } from "../dominio/tipos";

/**
 * El catálogo (13/10): la misma fila que el resto de listas. Marca, familia y
 * subfamilia siguen con buscador —son cientos— y la casilla «Incluir los
 * dados de baja» pasa al desplegable «Mostrar».
 */
export function FiltrosProductosBarra({
  marcas,
  familias,
  subfamilias,
}: {
  marcas: Opcion[];
  familias: Opcion[];
  subfamilias: Opcion[];
}) {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const familia = valor("familia");
  const hay = ["q", "marca", "familia", "subfamilia", "archivados"].some((k) => valor(k));

  // Con una familia elegida, solo sus subfamilias.
  const subfamiliasVisibles = React.useMemo(
    () => (familia ? subfamilias.filter((s) => s.familia_id === familia) : subfamilias),
    [familia, subfamilias],
  );

  return (
    <div className="px-4 pb-4 sm:px-6">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Buscar por código o descripción…"
          etiqueta="Buscar productos"
        />
        <FiltroBuscable
          id="f-marca"
          etiqueta="Marca"
          todos="Todas las marcas"
          buscar="SKF, FAG, NTN…"
          valor={valor("marca")}
          opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          onCambiar={(v) => aplicar("marca", v)}
        />
        <FiltroBuscable
          id="f-familia"
          etiqueta="Familia"
          todos="Todas las familias"
          buscar="Rodamiento, retén…"
          valor={familia}
          opciones={familias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          // Cambiar de familia invalida la subfamilia elegida.
          onCambiar={(v) => aplicarVarios({ familia: v, subfamilia: "" })}
        />
        <FiltroBuscable
          id="f-subfamilia"
          etiqueta="Subfamilia"
          todos="Todas las subfamilias"
          buscar="Rígido de bolas, cónicos…"
          valor={valor("subfamilia")}
          opciones={subfamiliasVisibles.map((x) => ({ valor: x.id, etiqueta: x.nombre }))}
          onCambiar={(v) => aplicar("subfamilia", v)}
        />
        {/* «De baja», como dice la etiqueta de cada producto. */}
        <FiltroDesplegable
          icono={Eye}
          etiqueta="Mostrar"
          todos="Sin dados de baja"
          valor={valor("archivados") === "1" ? "1" : ""}
          opciones={[{ valor: "1", etiqueta: "Con dados de baja" }]}
          onCambiar={(v) => aplicar("archivados", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
