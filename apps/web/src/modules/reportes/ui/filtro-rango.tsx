"use client";

/*
 * "use client" OBLIGATORIO: escribe el rango en la URL conforme se elige.
 *
 * El rango vive en los search params y no en estado local. Es la misma regla
 * del resto del ERP, y aquí tiene una ventaja concreta: el informe de «julio
 * por semana» se pega en un WhatsApp y abre exactamente eso.
 */

import * as React from "react";

import { Input, SelectNativo } from "@rodatech/ui";

import { useFiltrosUrl } from "@/lib/use-filtros-url";

import {
  ETIQUETA_ATAJO,
  ETIQUETA_GRANO,
  GRANOS,
  type Atajo,
  type Grano,
} from "../dominio/rango";

/**
 * Una fecha ISO en letra, sin tocar zonas horarias.
 *
 * Se parte a mano en vez de pasar por `new Date(iso)`: eso lo interpreta como
 * medianoche UTC y en Lima —cinco horas por detrás— pinta el día ANTERIOR. Es
 * el fallo clásico de fechas en este proyecto, y aquí saldría en la frase que
 * dice qué periodo se está mirando.
 */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function enLetra(iso: string): string {
  const [a, m, d] = iso.split("-");
  const mes = MESES[Number(m) - 1];
  if (!a || !d || !mes) return iso;
  return `${Number(d)} de ${mes} de ${a}`;
}

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
  extra,
}: {
  desde: string;
  hasta: string;
  grano: Grano;
  atajo: Atajo | null;
  /**
   * Más filtros en la misma fila que las fechas: «Comparar con» y el cliente
   * del tablero ejecutivo (06/10). Una segunda barra debajo habría empujado
   * las cifras otra vez fuera de la pantalla del teléfono.
   */
  extra?: React.ReactNode;
}) {
  // Cada cambio parte del último pedido, no del último cargado: si no,
  // «Hasta» puesto justo después de «Desde» lo borraba (07/10).
  const { valores, aplicar: aplicarUrl, pendiente } = useFiltrosUrl();
  const aplicar = (cambios: Record<string, string | null>) => aplicarUrl(cambios);
  // Mientras carga, las cajas enseñan lo pedido y no vuelven atrás.
  const desdeVisto = pendiente && valores.get("desde") ? (valores.get("desde") as string) : desde;
  const hastaVisto = pendiente && valores.get("hasta") ? (valores.get("hasta") as string) : hasta;

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
      desde: clave === "desde" ? valor : desdeVisto,
      hasta: clave === "hasta" ? valor : hastaVisto,
      grano: null,
    });

  return (
    <section className="card flex flex-col gap-3 p-3">
      {/*
        Los atajos y, a la derecha, QUÉ periodo se está mirando.

        La frase no es adorno: los atajos dicen la intención («este mes») y las
        dos cajas de fecha dicen el dato, pero hasta que no se leen las dos
        juntas no se sabe si «este mes» son ocho días o treinta. En un tablero
        que se abre para comparar contra el periodo anterior, esa diferencia lo
        cambia todo.

        Las pastillas suben a 36 px y `text-sm`: iban a 12 px, que en este
        proyecto es directamente un fallo.
      */}
      {/*
        EN EL TELÉFONO, UN DESPLEGABLE (revisión por módulos del 02/10).

        Las ocho pastillas ocupaban cuatro filas, y con las fechas debajo el
        filtro llenaba la pantalla entera: Willy abría el tablero y no veía
        ni una cifra hasta bajar. El desplegable nativo del teléfono es grande,
        se toca bien y deja las cifras a la vista.
      */}
      <label className="flex flex-col gap-1 sm:hidden">
        <span className="text-sm font-medium text-[var(--fg-muted)]">Periodo</span>
        <SelectNativo
          value={atajo ?? ""}
          onChange={(e) => {
            if (e.target.value) elegirAtajo(e.target.value as Atajo);
          }}
        >
          {atajo === null ? <option value="">Entre dos fechas</option> : null}
          {ATAJOS.map((a) => (
            <option key={a} value={a}>
              {ETIQUETA_ATAJO[a]}
            </option>
          ))}
        </SelectNativo>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden flex-wrap gap-1.5 sm:flex">
          {ATAJOS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => elegirAtajo(a)}
              aria-pressed={atajo === a}
              className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
                atajo === a
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                  : "border-[var(--border)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {ETIQUETA_ATAJO[a]}
            </button>
          ))}
        </div>

        <p className="text-sm tabular text-[var(--fg-muted)]">
          {enLetra(desde)} — {enLetra(hasta)}
        </p>
      </div>

      {/* En el teléfono, las dos fechas en una fila y «Agrupar» debajo. */}
      <div className="grid grid-cols-2 items-end gap-3 border-t border-[var(--border-soft)] pt-3 sm:flex sm:flex-wrap">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-[var(--fg-muted)]">Desde</span>
          <Input
            type="date"
            value={desdeVisto}
            max={hastaVisto}
            onChange={(e) => cambiarFecha("desde", e.target.value)}
            className="w-full tabular sm:w-auto"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-[var(--fg-muted)]">Hasta</span>
          <Input
            type="date"
            value={hastaVisto}
            min={desdeVisto}
            onChange={(e) => cambiarFecha("hasta", e.target.value)}
            className="w-full tabular sm:w-auto"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-sm font-medium text-[var(--fg-muted)]">Agrupar</span>
          <SelectNativo
            value={grano}
            onChange={(e) => aplicar({ grano: e.target.value })}
            className="w-full sm:w-auto"
          >
            {GRANOS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GRANO[g]}
              </option>
            ))}
          </SelectNativo>
        </label>

        {extra}
      </div>
    </section>
  );
}
