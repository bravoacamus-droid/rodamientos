"use client";

// Cliente: escribe los filtros en la URL conforme se usan. La lectura sigue
// pasando en el servidor — la URL es el estado.

import { ArrowDownUp, CalendarClock, CircleAlert, Clock, List, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonVariants, cn } from "@rodatech/ui";
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
    <div className="flex flex-col gap-3 px-4 pb-4">
      <BotonesSituacion actual={mostrar} onElegir={(v) => aplicarVarios({ mostrar: v, vencido: "", tramo: "" })} />
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
 * Vencidas, por vencer, todo lo que se debe o todas, en botones a la vista.
 *
 * Willy, 04/11: *«en cobranzas las facturas deben aparecer todas en
 * correlativo, en rojo las vencidas y con opciones a filtrar las vencidas y
 * las que están por vencer»*. El filtro existía desde el 31/10, pero dentro
 * del desplegable «Mostrar», entre siete opciones: no lo encontraba. Un
 * botón tiene que parecer un botón (CLAUDE.md §1). El desplegable se queda
 * para lo demás: el CR y las pagadas.
 */
const SITUACIONES: { valor: string; etiqueta: string; icono: LucideIcon; rojo?: boolean }[] = [
  { valor: "", etiqueta: "Todo lo que se debe", icono: List },
  { valor: "vencido", etiqueta: "Vencidas", icono: CircleAlert, rojo: true },
  { valor: "por_vencer", etiqueta: "Por vencer", icono: Clock },
  { valor: "todas", etiqueta: "Todas, también las pagadas", icono: ListChecks },
];

function BotonesSituacion({ actual, onElegir }: { actual: string; onElegir: (v: string) => void }) {
  return (
    <div role="group" aria-label="Qué facturas ver" className="flex flex-wrap gap-2">
      {SITUACIONES.map((s) => {
        const activo = actual === s.valor;
        const Icono = s.icono;
        return (
          <button
            key={s.valor || "debe"}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(s.valor)}
            className={cn(
              buttonVariants({ variant: activo ? "primary" : "outline" }),
              "h-11 gap-1.5 px-4 text-base",
              s.rojo && !activo ? "border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" : "",
              s.rojo && activo ? "bg-[var(--danger)] hover:bg-[var(--danger)]" : "",
            )}
          >
            <Icono className="size-5" aria-hidden="true" />
            {s.etiqueta}
          </button>
        );
      })}
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
