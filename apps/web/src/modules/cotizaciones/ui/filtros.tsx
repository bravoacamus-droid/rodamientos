"use client";

import { CircleDot, Hash } from "lucide-react";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETIQUETA_ESTADO, type EstadoCotizacion } from "../dominio/tipos";

// Los que se miran a diario, y desde el 07/10 también «Vencida»: con el
// histórico cargado son 609, y son las que se pueden volver a ofrecer.
const ESTADOS = ["borrador", "enviada", "aprobada", "atendida", "vencida", "rechazada", "anulada"] as const;

/**
 * La fila de filtros de cotizaciones (12/10): buscar, cliente, estado y serie.
 *
 * El estado eran seis botones sueltos (Luis: *«se ve feo»*). Ahora es un
 * desplegable que dice cuántas hay de cada una, que era lo único que daban los
 * botones de más.
 */
export function FiltrosCotizacionesBarra({
  nombreCliente,
  conteo,
  series,
}: {
  nombreCliente: string | null;
  conteo: Partial<Record<EstadoCotizacion, number>>;
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
        placeholder="Buscar por número, cliente u orden de compra"
        etiqueta="Buscar cotizaciones"
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
        opciones={ESTADOS.map((e) => ({
          valor: e,
          etiqueta: conteo[e] ? `${ETIQUETA_ESTADO[e]} (${conteo[e]})` : ETIQUETA_ESTADO[e],
        }))}
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
