"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado, y así un filtro se puede
// compartir por enlace y sobrevive a recargar la página.

import { FileCheck2, FileText, Hash, ShieldCheck, Wallet } from "lucide-react";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETIQUETA_SUNAT, ETIQUETA_TIPO } from "../dominio/tipos";

/**
 * Una fila (12/10): buscar, cliente, tipo, cobro, SUNAT y serie. Antes eran
 * dos filas con una etiqueta encima de cada campo; Luis pidió la barra de
 * desplegables de otro sistema, y la serie (F002 frente a F001 de prueba).
 *
 * El estado del cobro: «Vencido» no se ofrece —ese estado no lo pone nadie, y
 * lo vencido se cobra desde Cobranzas— (revisión por módulos del 02/10).
 */
export function FiltrosFacturacionBarra({
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
  const hay = ["q", "cliente", "tipo", "estado", "sunat", "cr", "serie"].some((k) => valor(k));

  return (
    <FilaFiltros>
      <CajaBuscar
        valor={texto}
        onCambiar={setTexto}
        placeholder="Número, cliente u orden de compra"
        etiqueta="Buscar comprobantes"
      />
      <FiltroCliente
        compacto
        valor={valor("cliente") || null}
        nombre={nombreCliente}
        onCambiar={(id) => aplicar("cliente", id ?? "")}
      />
      <FiltroDesplegable
        icono={FileText}
        etiqueta="Tipo"
        todos="Tipo: todos"
        valor={valor("tipo")}
        // Sin boletas: Willy no las emite (14/10).
        opciones={Object.entries(ETIQUETA_TIPO)
          .filter(([v]) => v !== "boleta")
          .map(([v, t]) => ({ valor: v, etiqueta: t }))}
        onCambiar={(v) => aplicar("tipo", v)}
      />
      <FiltroDesplegable
        icono={Wallet}
        etiqueta="Cobro"
        todos="Cobro: todos"
        valor={valor("estado")}
        opciones={[
          { valor: "emitido", etiqueta: "Por cobrar" },
          { valor: "pagado", etiqueta: "Cobrado" },
          { valor: "anulado", etiqueta: "Anulado" },
        ]}
        onCambiar={(v) => aplicar("estado", v)}
      />
      <FiltroDesplegable
        icono={ShieldCheck}
        etiqueta="SUNAT"
        todos="SUNAT: todos"
        valor={valor("sunat")}
        opciones={Object.entries(ETIQUETA_SUNAT).map(([v, t]) => ({ valor: v, etiqueta: t }))}
        onCambiar={(v) => aplicar("sunat", v)}
      />
      <FiltroDesplegable
        icono={FileCheck2}
        etiqueta="Retención"
        todos="Retención: todas"
        valor={valor("cr")}
        opciones={[{ valor: "sin", etiqueta: "Falta el comprobante de retención" }]}
        onCambiar={(v) => aplicar("cr", v)}
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
