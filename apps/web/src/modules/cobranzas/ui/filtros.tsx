"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { ArrowDownUp, CalendarClock, CircleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { FiltroCliente } from "@/componentes/filtro-cliente";
import { CajaBuscar, FiltroDesplegable, FilaFiltros, LimpiarFiltros, useBarraFiltros } from "@/componentes/filtros";

import { ORDENES, ordenPorDefecto } from "../dominio/situacion";
import { MOSTRAR } from "../dominio/tipos";

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
 *
 * Desde el 31/10 «Mostrar» también deja ver lo ya pagado: con su CR, sin él,
 * sin retención. Willy quiere filtrar los que pagaron y los que deben el
 * documento de retención. `?vencido=1` sigue valiendo, por los enlaces viejos.
 *
 * El «Orden» (03/11) va aparte, en `OrdenCartera`, al lado del resumen:
 * con cinco desplegables en la fila, los textos se cortaban.
 */
export function FiltrosCarteraBarra({ nombreCliente }: { nombreCliente: string | null }) {
  const { valor, aplicar, aplicarVarios, limpiar, texto, setTexto } = useBarraFiltros();
  const hay = ["q", "cliente", "tramo", "vencido", "mostrar", "orden"].some((k) => valor(k));
  const mostrar = valor("mostrar") || (valor("vencido") === "1" ? "vencido" : "");
  // La antigüedad es de lo que se debe: con lo pagado no se ofrece.
  const dePagadas = mostrar !== "" && mostrar !== "vencido" && mostrar !== "por_vencer";

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
        {dePagadas ? null : (
          <FiltroDesplegable
            icono={CalendarClock}
            etiqueta="Antigüedad"
            todos="Antigüedad: toda"
            valor={valor("tramo")}
            opciones={TRAMOS}
            onCambiar={(v) => aplicar("tramo", v)}
          />
        )}
        <FiltroDesplegable
          icono={CircleAlert}
          etiqueta="Mostrar"
          todos="Todo lo que se debe"
          valor={mostrar}
          opciones={Object.entries(MOSTRAR).map(([v, t]) => ({ valor: v, etiqueta: t }))}
          onCambiar={(v) => aplicarVarios({ mostrar: v, vencido: "", tramo: v && v !== "vencido" ? "" : valor("tramo") })}
        />
        <LimpiarFiltros visible={hay} onLimpiar={limpiar} />
      </FilaFiltros>
    </div>
  );
}

/**
 * El orden de la lista (03/11). Willy: «es preferible que las facturas salgan
 * ordenadas por correlativo para llevar un mejor control». Por número va por
 * defecto; «más atrasadas primero» se queda para cuando se sale a llamar.
 * Enseña el orden que rige aunque no se haya elegido, en vez de un «Orden»
 * vacío que no dice nada.
 */
export function OrdenCartera() {
  const { valor, aplicar } = useBarraFiltros();
  const sp = useSearchParams();
  const mostrar = sp.get("mostrar") ?? "";
  const conPagadas = mostrar !== "" && mostrar !== "vencido" && mostrar !== "por_vencer";
  return (
    <div className="w-full sm:w-72">
      <FiltroDesplegable
        icono={ArrowDownUp}
        etiqueta="Orden"
        todos={ORDENES[ordenPorDefecto(conPagadas)]}
        valor={valor("orden")}
        opciones={Object.entries(ORDENES).map(([v, t]) => ({ valor: v, etiqueta: t }))}
        onCambiar={(v) => aplicar("orden", v)}
      />
    </div>
  );
}
