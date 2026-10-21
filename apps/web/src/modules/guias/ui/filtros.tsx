"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { CircleDot, Hash } from "lucide-react";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETIQUETA_ESTADO } from "../dominio/tipos";

/**
 * Una fila (12/10): buscar, cliente, estado y serie, como en cotizaciones y
 * facturación. El cliente se teclea y va listando, en vez de un desplegable
 * con la cartera entera dentro.
 */
export function FiltrosGuiasBarra({
  nombreCliente,
  series,
}: {
  /** La razón social del cliente filtrado, si hay uno. */
  nombreCliente: string | null;
  series: { valor: string; etiqueta: string }[];
}) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  // «Limpiar», como en clientes, productos y compras (21/10): aquí faltaba,
  // y con tres desplegables puestos había que deshacerlos uno por uno.
  const hay = ["q", "cliente", "estado", "serie"].some((k) => valor(k));

  return (
    <FilaFiltros>
      <CajaBuscar
        valor={texto}
        onCambiar={setTexto}
        placeholder="Número, dirección de entrega o placa"
        etiqueta="Buscar guías"
      />
      <FiltroCliente
        compacto
        valor={valor("cliente") || null}
        nombre={nombreCliente}
        onCambiar={(id) => aplicar("cliente", id ?? "")}
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
        icono={Hash}
        etiqueta="Serie"
        todos="Serie: todas"
        valor={valor("serie")}
        opciones={series}
        onCambiar={(v) => aplicar("serie", v)}
      />
      <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
    </FilaFiltros>
  );
}
