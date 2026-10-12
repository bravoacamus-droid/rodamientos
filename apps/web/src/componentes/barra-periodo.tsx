"use client";

import * as React from "react";
import { CalendarDays, X } from "lucide-react";
import { Input } from "@rodatech/ui";

import { useFiltrosUrl } from "@/lib/use-filtros-url";

/**
 * El periodo de una lista: atajos y dos fechas, igual en las cinco de ventas.
 *
 * Luis, 07/10: *«buenos filtros de fechas, por fechas, hacerlo más
 * profesional»*. Cada lista tenía lo suyo —cotizaciones nada, facturación y
 * guías dos cajas de fecha sueltas, cobranzas nada—, y dos controles que hacen
 * lo mismo de forma distinta en dos pantallas del mismo sistema es de lo que
 * más desconfianza genera (lo mismo se dijo de la barra del tablero, 26/08).
 *
 * Escribe `desde` y `hasta` en la URL, que es lo que las cinco consultas ya
 * leían, y borra el cursor de la paginación: con otro rango, «la página 3»
 * ya no es la misma.
 *
 * Los atajos son botones con borde (CLAUDE.md §1) y el elegido va relleno. Sin
 * fechas es «Todo», que es como abren las listas.
 */

type Atajo = "todo" | "mes" | "mes_pasado" | "trimestre" | "anio";

const ETIQUETA: Record<Atajo, string> = {
  todo: "Todo",
  mes: "Este mes",
  mes_pasado: "Mes pasado",
  trimestre: "Últimos 3 meses",
  anio: "Este año",
};

function hoyEnLima(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
}

function sumarMeses(iso: string, meses: number): string {
  const a = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

function finDeMes(primero: string): string {
  const d = new Date(`${sumarMeses(primero, 1)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function rangoDe(a: Atajo, hoy: string): { desde: string | null; hasta: string | null } {
  const mes = `${hoy.slice(0, 7)}-01`;
  switch (a) {
    case "mes":
      return { desde: mes, hasta: hoy };
    case "mes_pasado": {
      const ini = sumarMeses(mes, -1);
      return { desde: ini, hasta: finDeMes(ini) };
    }
    case "trimestre":
      return { desde: sumarMeses(mes, -2), hasta: hoy };
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    default:
      return { desde: null, hasta: null };
  }
}

export function BarraPeriodo({
  titulo = "Periodo",
  ayuda,
}: {
  titulo?: string;
  /** Una frase de qué filtra, cuando no es evidente (cobranzas). */
  ayuda?: string;
}) {
  // Parte del último cambio pedido, no del último cargado (07/10): si no,
  // «Hasta» puesto justo después de «Desde» lo borraba.
  const { valores, aplicar: aplicarUrl } = useFiltrosUrl();
  const desde = valores.get("desde") ?? "";
  const hasta = valores.get("hasta") ?? "";
  const hoy = hoyEnLima();

  const activo = (Object.keys(ETIQUETA) as Atajo[]).find((a) => {
    const r = rangoDe(a, hoy);
    return (r.desde ?? "") === desde && (r.hasta ?? "") === hasta;
  });

  function aplicar(nuevo: { desde: string | null; hasta: string | null }) {
    // La página en la que se estaba deja de valer con otro periodo.
    aplicarUrl(nuevo, ["cursor", "dir"]);
  }

  return (
    /*
      Un solo grupo, no cinco botones sueltos (Luis, 12/10: *«se ve feo»*,
      con la barra de otro sistema delante). Sigue pareciendo pulsable —un
      marco con las opciones dentro y la elegida en blanco y azul— y ocupa una
      fila en vez de dos.
    */
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={titulo}
        className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1"
      >
        <CalendarDays className="mx-1.5 size-4 text-[var(--fg-subtle)]" aria-hidden="true" />
        {(Object.keys(ETIQUETA) as Atajo[]).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={activo === a}
            onClick={() => aplicar(rangoDe(a, hoy))}
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors ${
              activo === a
                ? "bg-[var(--surface)] font-semibold text-brand-700 elev-1 dark:text-brand-300"
                : "font-medium text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"
            }`}
          >
            {ETIQUETA[a]}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2">
        <span className="text-sm text-[var(--fg-muted)]">Desde</span>
        <Input
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => aplicar({ desde: e.target.value || null, hasta: hasta || null })}
          className="w-[10.5rem] tabular"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-sm text-[var(--fg-muted)]">Hasta</span>
        <Input
          type="date"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => aplicar({ desde: desde || null, hasta: e.target.value || null })}
          className="w-[10.5rem] tabular"
        />
      </label>
        {desde || hasta ? (
          <button
            type="button"
            onClick={() => aplicar({ desde: null, hasta: null })}
            className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <X className="size-4" aria-hidden="true" />
            Quitar fechas
          </button>
        ) : null}
      {ayuda ? <span className="text-sm text-[var(--fg-subtle)]">{ayuda}</span> : null}
    </div>
  );
}
