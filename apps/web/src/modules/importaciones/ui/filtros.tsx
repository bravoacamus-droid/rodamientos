"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Eye } from "lucide-react";

import { CajaBuscar, FiltroDesplegable, FilaFiltros, useBarraFiltros } from "@/componentes/filtros";

/**
 * Importaciones (13/10): una fila, como el resto de listas. «En camino /
 * Todas» eran dos botones; ahora es el desplegable «Ver». Sin la clave en la
 * URL se ven las que vienen en camino, como siempre.
 */
export function FiltrosImportacionesBarra() {
  const { valor, aplicar, texto, setTexto } = useBarraFiltros();

  return (
    <div className="px-4 pb-4">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Compra, tracking, courier o factura"
          etiqueta="Buscar importaciones"
        />
        <FiltroDesplegable
          icono={Eye}
          etiqueta="Qué importaciones ver"
          todos="Las que vienen en camino"
          valor={valor("abiertas") === "0" ? "0" : ""}
          opciones={[{ valor: "0", etiqueta: "Todas, también las recibidas" }]}
          onCambiar={(v) => aplicar("abiertas", v)}
        />
      </FilaFiltros>
    </div>
  );
}
