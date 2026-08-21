import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";

import { conteoPorEstado } from "../api/consultas";
import {
  ETIQUETA_ESTADO,
  esEstadoCotizacion,
  type EstadoCotizacion,
  type FiltrosCotizaciones,
} from "../dominio/tipos";
import { TablaCotizaciones } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

function estadoDeUrl(v: string | string[] | undefined): EstadoCotizacion | undefined {
  const valor = uno(v);
  return esEstadoCotizacion(valor) ? valor : undefined;
}

/** Pastillas de estado. Son enlaces, no botones: filtrar es navegar. */
async function FiltroEstados({ activo }: { activo?: EstadoCotizacion }) {
  const resultado = await conteoPorEstado();
  const conteo: Partial<Record<EstadoCotizacion, number>> = resultado.ok
    ? resultado.datos
    : {};
  // Los cuatro estados que un vendedor mira a diario. Los otros tres
  // (rechazada, vencida, anulada) se llegan por el buscador, no por pastilla.
  const estados = ["borrador", "enviada", "aprobada", "atendida"] as const;

  const clase = (seleccionado: boolean) =>
    `rounded-sm px-2.5 py-1 text-sm transition-colors ${
      seleccionado
        ? "bg-brand-600 font-medium text-white"
        : "bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
    }`;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href="/cotizaciones" className={clase(!activo)}>
        Todas
      </Link>
      {estados.map((e) => (
        <Link
          key={e}
          href={`/cotizaciones?estado=${e}`}
          className={clase(activo === e)}
        >
          {ETIQUETA_ESTADO[e]}
          {conteo[e] ? (
            <span className="ml-1.5 tabular opacity-70">{conteo[e]}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/**
 * Listado de cotizaciones.
 *
 * Conserva la composición de la demo: filtros por estado arriba, tabla con el
 * margen visible por fila, y acceso directo a crear una nueva.
 */
export default async function PaginaCotizaciones({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosCotizaciones = {
    q: uno(sp.q),
    // Viene de la query string, así que se valida contra el enum antes de
    // llegar a la consulta.
    estado: estadoDeUrl(sp.estado),
    cliente: uno(sp.cliente),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Precios en dólares, sin IGV en la columna de valor unitario.
          </p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="rounded-sm bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          Nueva cotización
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-8 w-full max-w-80" />}>
        <FiltroEstados activo={filtros.estado} />
      </Suspense>

      <section className="card">
        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaCotizaciones filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
