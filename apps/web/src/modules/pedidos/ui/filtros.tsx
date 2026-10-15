"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { Banknote, CircleDot, ShieldCheck, Truck } from "lucide-react";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ETAPAS, ETIQUETA_ETAPA } from "../dominio/etapa";

/**
 * Los filtros de pedidos (131), en una fila como en guías y facturación:
 * buscar, cliente, etapa, cobro, SUNAT y guía. Son las preguntas que Luis
 * puso en voz alta: *«si está pagado o enviado a SUNAT o si ya tiene una guía
 * hecha»*.
 */
export function FiltrosPedidosBarra({ nombreCliente }: { nombreCliente: string | null }) {
  const { valor, aplicar, texto, setTexto } = useBarraFiltros();

  return (
    <FilaFiltros>
      <CajaBuscar
        valor={texto}
        onCambiar={setTexto}
        placeholder="Pedido, cotización, cliente o código"
        etiqueta="Buscar pedidos"
      />
      <FiltroCliente
        compacto
        valor={valor("cliente") || null}
        nombre={nombreCliente}
        onCambiar={(id) => aplicar("cliente", id ?? "")}
      />
      <FiltroDesplegable
        icono={CircleDot}
        etiqueta="Etapa"
        todos="Etapa: todas"
        valor={valor("etapa")}
        opciones={ETAPAS.map((e) => ({ valor: e, etiqueta: ETIQUETA_ETAPA[e] }))}
        onCambiar={(v) => aplicar("etapa", v)}
      />
      <FiltroDesplegable
        icono={Banknote}
        etiqueta="Cobro"
        todos="Cobro: todos"
        valor={valor("cobro")}
        opciones={[
          { valor: "sin_factura", etiqueta: "Sin factura" },
          { valor: "pendiente", etiqueta: "Por cobrar" },
          { valor: "vencido", etiqueta: "Vencido" },
          { valor: "pagado", etiqueta: "Cobrado" },
        ]}
        onCambiar={(v) => aplicar("cobro", v)}
      />
      <FiltroDesplegable
        icono={ShieldCheck}
        etiqueta="SUNAT"
        todos="SUNAT: todos"
        valor={valor("sunat")}
        opciones={[
          { valor: "aceptado", etiqueta: "Aceptado" },
          { valor: "pendiente", etiqueta: "Sin enviar" },
          { valor: "rechazado", etiqueta: "Rechazado" },
          { valor: "sin_factura", etiqueta: "Sin factura" },
        ]}
        onCambiar={(v) => aplicar("sunat", v)}
      />
      <FiltroDesplegable
        icono={Truck}
        etiqueta="Guía"
        todos="Guía: todas"
        valor={valor("guia")}
        opciones={[
          { valor: "con", etiqueta: "Con guía emitida" },
          { valor: "sin", etiqueta: "Sin guía" },
        ]}
        onCambiar={(v) => aplicar("guia", v)}
      />
    </FilaFiltros>
  );
}
