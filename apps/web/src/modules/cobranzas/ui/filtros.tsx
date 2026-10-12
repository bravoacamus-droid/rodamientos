"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { CalendarClock, CircleAlert } from "lucide-react";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

const TRAMOS: { valor: string; etiqueta: string }[] = [
  { valor: "por_vencer", etiqueta: "Por vencer" },
  { valor: "1_30", etiqueta: "1 a 30 días" },
  { valor: "31_60", etiqueta: "31 a 60 días" },
  { valor: "61_90", etiqueta: "61 a 90 días" },
  { valor: "mas_90", etiqueta: "Más de 90 días" },
  { valor: "sin_vencimiento", etiqueta: "Sin vencimiento" },
];

/**
 * La cartera (13/10): una fila de desplegables, como el resto de listas.
 * «Solo vencido» era un botón suelto; ahora es el desplegable «Mostrar», que
 * se pinta en azul cuando está puesto, igual que los demás.
 */
export function FiltrosCarteraBarra({ nombreCliente }: { nombreCliente: string | null }) {
  const { valor, aplicar, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "cliente", "tramo", "vencido"].some((k) => valor(k));

  return (
    <div className="px-4 pb-4">
      <FilaFiltros>
        <CajaBuscar
          valor={texto}
          onCambiar={setTexto}
          placeholder="Número, cliente u orden de compra"
          etiqueta="Buscar en la cartera"
        />
        <FiltroCliente
          compacto
          valor={valor("cliente") || null}
          nombre={nombreCliente}
          onCambiar={(id) => aplicar("cliente", id ?? "")}
        />
        <FiltroDesplegable
          icono={CalendarClock}
          etiqueta="Antigüedad"
          todos="Antigüedad: toda"
          valor={valor("tramo")}
          opciones={TRAMOS}
          onCambiar={(v) => aplicar("tramo", v)}
        />
        <FiltroDesplegable
          icono={CircleAlert}
          etiqueta="Mostrar"
          todos="Todo lo que se debe"
          valor={valor("vencido") === "1" ? "1" : ""}
          opciones={[{ valor: "1", etiqueta: "Solo lo vencido" }]}
          onCambiar={(v) => aplicar("vencido", v)}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}
