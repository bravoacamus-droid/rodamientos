"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La URL es el
// estado, como en productos y cotizaciones.

import { Archive, Wrench } from "lucide-react";

import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

/**
 * Los kits (13/10): la misma fila que el resto de listas. Luis, 17/09: *«en
 * el panel principal no veo ni filtro»*. Son tres: buscar, si se pueden armar
 * y si se ven los de baja. Los dos estados eran botones; ahora, desplegables.
 *
 * Los valores se leen de la URL, la misma fuente que lee la página.
 */
export function FiltrosKits() {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "estado", "archivados"].some((k) => valor(k));

  return (
    <FilaFiltros>
      <CajaBuscar
        valor={texto}
        onCambiar={setTexto}
        placeholder="Buscar por código o descripción…"
        etiqueta="Buscar kits"
      />
      <FiltroDesplegable
        icono={Wrench}
        etiqueta="Se pueden armar"
        todos="Armables y no armables"
        valor={valor("estado")}
        opciones={[
          { valor: "armables", etiqueta: "Se pueden armar" },
          { valor: "faltos", etiqueta: "Falta material" },
        ]}
        onCambiar={(v) => aplicar("estado", v)}
      />
      <FiltroDesplegable
        icono={Archive}
        etiqueta="Mostrar"
        todos="Sin los de baja"
        valor={valor("archivados") === "1" ? "1" : ""}
        opciones={[{ valor: "1", etiqueta: "Con los de baja" }]}
        onCambiar={(v) => aplicar("archivados", v)}
      />
      <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
    </FilaFiltros>
  );
}
