"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { FolderOpen } from "lucide-react";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FiltroBuscable, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ENTIDADES, ETIQUETA_ENTIDAD } from "../dominio/tipos";

/**
 * La bitácora (13/10): el periodo arriba y una fila debajo, como el resto de
 * listas. «Quién» sigue con buscador: son las cuentas del equipo.
 */
export function FiltrosBarra({ personas }: { personas: { id: string; nombre: string }[] }) {
  const { valor, aplicar, limpiar } = useBarraFiltros();
  const hay = ["entidad", "usuario", "desde", "hasta"].some((k) => valor(k));

  return (
    <div className="flex flex-col gap-3 px-4 pb-3">
      <BarraPeriodo />
      <FilaFiltros>
        <FiltroDesplegable
          icono={FolderOpen}
          etiqueta="Qué"
          todos="Qué: todo"
          valor={valor("entidad")}
          opciones={ENTIDADES.map((e) => ({ valor: e, etiqueta: ETIQUETA_ENTIDAD[e] ?? e }))}
          onCambiar={(v) => aplicar("entidad", v)}
        />
        <FiltroBuscable
          id="f-quien"
          etiqueta="Quién"
          todos="Quién: cualquiera"
          buscar="Escribe el nombre…"
          valor={valor("usuario")}
          opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
          onCambiar={(v) => aplicar("usuario", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
