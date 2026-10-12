"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Eye, Ship } from "lucide-react";

import { CajaBuscar, FiltroBuscable, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

/**
 * Proveedores (13/10): una fila de desplegables. «Vende la marca» sigue con
 * buscador —las marcas son cientos— y la casilla de los desactivados pasa a
 * un desplegable «Mostrar».
 */
export function FiltrosProveedoresBarra({ marcas }: { marcas: { id: string; nombre: string }[] }) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "marca", "tipo", "inactivos"].some((k) => valor(k));

  return (
    <div className="px-4 pb-4">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Razón social, RUC o código"
          etiqueta="Buscar proveedores"
        />
        {/* La pregunta que justifica que exista `proveedor_marcas`. */}
        <FiltroBuscable
          id="f-marca-proveedor"
          etiqueta="Vende la marca"
          todos="Vende cualquier marca"
          buscar="SKF, FAG, NTN…"
          valor={valor("marca")}
          opciones={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          onCambiar={(v) => aplicar("marca", v)}
        />
        <FiltroDesplegable
          icono={Ship}
          etiqueta="Tipo"
          todos="Tipo: todos"
          valor={valor("tipo")}
          opciones={[
            { valor: "local", etiqueta: "Local" },
            { valor: "importacion", etiqueta: "Importación" },
          ]}
          onCambiar={(v) => aplicar("tipo", v)}
        />
        <FiltroDesplegable
          icono={Eye}
          etiqueta="Mostrar"
          todos="Solo activos"
          valor={valor("inactivos")}
          opciones={[{ valor: "1", etiqueta: "También desactivados" }]}
          onCambiar={(v) => aplicar("inactivos", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
