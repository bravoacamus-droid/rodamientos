"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { CajaBuscar, FiltroBuscable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import type { ProveedorOpcion } from "../dominio/tipos";

/**
 * Recepciones (13/10): el periodo arriba y una fila debajo, como el resto de
 * listas. Las fechas sueltas pasan al grupo de periodo común.
 */
export function FiltrosRecepcionesBarra({ proveedores }: { proveedores: ProveedorOpcion[] }) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "proveedor", "desde", "hasta"].some((k) => valor(k));

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <BarraPeriodo />
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Número, guía o factura del proveedor"
          etiqueta="Buscar recepciones"
        />
        <FiltroBuscable
          id="f-proveedor"
          etiqueta="Proveedor"
          todos="Todos los proveedores"
          buscar="Escribe parte del nombre…"
          valor={valor("proveedor")}
          opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.razon_social }))}
          onCambiar={(v) => aplicar("proveedor", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
