"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { Input } from "@rodatech/ui";

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
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciar] = React.useTransition();

  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const hoy = hoyEnLima();

  const activo = (Object.keys(ETIQUETA) as Atajo[]).find((a) => {
    const r = rangoDe(a, hoy);
    return (r.desde ?? "") === desde && (r.hasta ?? "") === hasta;
  });

  function aplicar(nuevo: { desde: string | null; hasta: string | null }) {
    const s = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(nuevo)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    s.delete("cursor");
    s.delete("dir");
    const q = s.toString();
    iniciar(() => router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--fg-muted)]">
          <CalendarDays className="size-4" aria-hidden="true" />
          {titulo}
        </span>
        {ayuda ? <span className="text-sm text-[var(--fg-subtle)]">{ayuda}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(ETIQUETA) as Atajo[]).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={activo === a}
            onClick={() => aplicar(rangoDe(a, hoy))}
            className={`inline-flex h-10 items-center rounded-md border px-3 text-sm font-semibold transition-colors ${
              activo === a
                ? "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500"
                : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {ETIQUETA[a]}
          </button>
        ))}

        <span className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" aria-hidden="true" />

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
      </div>
    </div>
  );
}
