"use client";

/*
 * "use client" OBLIGATORIO: escribe el rango en la URL conforme se elige.
 *
 * El rango vive en los search params y no en estado local. Es la misma regla
 * del resto del ERP, y aquí tiene una ventaja concreta: el informe de «julio
 * por semana» se pega en un WhatsApp y abre exactamente eso.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, SelectNativo } from "@rodatech/ui";

import {
  ETIQUETA_ATAJO,
  ETIQUETA_GRANO,
  GRANOS,
  type Atajo,
  type Grano,
} from "../dominio/rango";

/** Los atajos, en el orden en que se usan de verdad. */
const ATAJOS: readonly Atajo[] = [
  "hoy",
  "semana",
  "mes",
  "mes_pasado",
  "trimestre",
  "anio",
  "12_meses",
  "todo",
];

export function FiltroRango({
  desde,
  hasta,
  grano,
  atajo,
}: {
  desde: string;
  hasta: string;
  grano: Grano;
  atajo: Atajo | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [, iniciarTransicion] = React.useTransition();

  const vigentes = React.useRef(params);
  vigentes.current = params;

  const aplicar = React.useCallback(
    (cambios: Record<string, string | null>) => {
      const siguientes = new URLSearchParams(vigentes.current.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguientes.set(clave, valor);
        else siguientes.delete(clave);
      }
      const query = siguientes.toString();
      iniciarTransicion(() =>
        router.replace(query ? `${ruta}?${query}` : ruta, { scroll: false }),
      );
    },
    [ruta, router],
  );

  /**
   * Al elegir un atajo se BORRAN las fechas sueltas y la granularidad.
   *
   * Si se quedaran, «hoy» seguiría enseñándose por mes porque alguien había
   * elegido esa granularidad para mirar dos años. La granularidad vuelve a la
   * sugerida, que es la única que se lee bien en cada caso.
   */
  const elegirAtajo = (a: Atajo) =>
    aplicar({ atajo: a, desde: null, hasta: null, grano: null });

  /** Al escribir una fecha se abandona el atajo: ya no es «este mes». */
  const cambiarFecha = (clave: "desde" | "hasta", valor: string) =>
    aplicar({
      atajo: null,
      desde: clave === "desde" ? valor : desde,
      hasta: clave === "hasta" ? valor : hasta,
      grano: null,
    });

  return (
    <section className="card flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1.5">
        {ATAJOS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => elegirAtajo(a)}
            aria-pressed={atajo === a}
            className={`inline-flex h-control-sm items-center rounded-sm border px-2.5 text-xs font-medium transition-colors ${
              atajo === a
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                : "border-[var(--border)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {ETIQUETA_ATAJO[a]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg-muted)]">Desde</span>
          <Input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => cambiarFecha("desde", e.target.value)}
            className="w-auto tabular"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg-muted)]">Hasta</span>
          <Input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => cambiarFecha("hasta", e.target.value)}
            className="w-auto tabular"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg-muted)]">Agrupar</span>
          <SelectNativo
            value={grano}
            onChange={(e) => aplicar({ grano: e.target.value })}
            className="w-auto"
          >
            {GRANOS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GRANO[g]}
              </option>
            ))}
          </SelectNativo>
        </label>
      </div>
    </section>
  );
}
