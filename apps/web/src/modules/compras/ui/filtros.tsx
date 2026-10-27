"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { CircleDot, Ship } from "lucide-react";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import { ETIQUETA_ESTADO, type ProveedorOpcion } from "../dominio/tipos";

/**
 * Compras (13/10): el periodo arriba y una fila de desplegables debajo, como
 * cotizaciones y facturas. Luis: *«pasa las demás listas a desplegables»*. Las
 * fechas sueltas «Desde / Hasta» pasan al grupo de periodo común.
 */
export function FiltrosComprasBarra({ proveedores }: { proveedores: ProveedorOpcion[] }) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "proveedor", "estado", "tipo", "desde", "hasta"].some((k) => valor(k));

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <BarraPeriodo />
      <FilaFiltros>
        {/* «guía aérea» y no «tracking», que es como se llama el campo en la
            compra (auditoría 27/10). Sin «del proveedor»: con él, la frase se
            cortaba a 1280 y a 1440. */}
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Número, factura o guía aérea"
          etiqueta="Buscar compras"
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
        <FiltroDesplegable
          icono={CircleDot}
          etiqueta="Estado"
          todos="Estado: todos"
          valor={valor("estado")}
          opciones={Object.entries(ETIQUETA_ESTADO).map(([v, t]) => ({ valor: v, etiqueta: t }))}
          onCambiar={(v) => aplicar("estado", v)}
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
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
