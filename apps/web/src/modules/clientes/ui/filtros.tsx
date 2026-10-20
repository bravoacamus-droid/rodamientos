"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Eye } from "lucide-react";

import {
  CajaBuscar,
  FiltroBuscable,
  FiltroDesplegable,
  FilaFiltros,
  LimpiarFiltros,
  useBarraFiltros,
} from "@/componentes/filtros";

import type { RubroCliente, ZonaCliente } from "../dominio/tipos";

/**
 * Clientes (13/10): una fila de desplegables, como el resto de listas.
 *
 * Las dos casillas «Ver bloqueados» y «Ver desactivados» pasan a UN
 * desplegable «Mostrar» con las cuatro combinaciones; en la URL siguen siendo
 * las dos claves de siempre, así que los enlaces viejos valen.
 */
export function FiltrosClientesBarra({ zonas, rubros }: { zonas: ZonaCliente[]; rubros: RubroCliente[] }) {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const bloqueados = valor("bloqueados") === "1";
  const inactivos = valor("inactivos") === "1";
  const mostrar = bloqueados && inactivos ? "todos" : bloqueados ? "bloqueados" : inactivos ? "inactivos" : "";
  const hay = ["q", "condicion", "zona", "rubro", "bloqueados", "inactivos"].some((k) => valor(k));

  return (
    <div className="px-4 pb-4 sm:px-6">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Razón social, RUC o código"
          etiqueta="Buscar clientes"
        />
        {/* Zona y rubro (141) en lugar de la condición de pago, que dejó
            de ser del cliente. Willy, 20/10: *«filtrar a los clientes por
            zona y poder trabajar cada cliente según su zona»*. */}
        <FiltroBuscable
          id="filtro-zona"
          etiqueta="Zona"
          todos="Todas las zonas"
          buscar="Escribe el distrito…"
          valor={valor("zona")}
          opciones={zonas.map((z) => ({ valor: z.id, etiqueta: z.nombre }))}
          onCambiar={(v) => aplicar("zona", v)}
        />
        <FiltroBuscable
          id="filtro-rubro"
          etiqueta="Rubro"
          todos="Todos los rubros"
          buscar="Escribe el rubro…"
          valor={valor("rubro")}
          opciones={rubros.map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
          onCambiar={(v) => aplicar("rubro", v)}
        />
        <FiltroDesplegable
          icono={Eye}
          etiqueta="Mostrar"
          todos="Solo activos"
          valor={mostrar}
          opciones={[
            { valor: "bloqueados", etiqueta: "También bloqueados" },
            { valor: "inactivos", etiqueta: "También desactivados" },
            { valor: "todos", etiqueta: "Todos" },
          ]}
          onCambiar={(v) =>
            aplicarVarios({
              bloqueados: v === "bloqueados" || v === "todos" ? "1" : "",
              inactivos: v === "inactivos" || v === "todos" ? "1" : "",
            })
          }
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
