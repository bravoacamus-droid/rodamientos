import { Suspense } from "react";
import Link from "next/link";
import { CircleCheck, FileText, Hourglass, Target } from "lucide-react";
import { Skeleton, formatearMoneda, leerTamano } from "@rodatech/ui";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FilaIndicadores, IndicadoresError, textoPeriodo } from "@/componentes/indicadores";

import { conteoPorEstado, indicadoresCotizaciones } from "../api/consultas";
import {
  ETIQUETA_ESTADO,
  esEstadoCotizacion,
  type EstadoCotizacion,
  type FiltrosCotizaciones,
} from "../dominio/tipos";
import { BuscadorCotizaciones } from "./buscador";
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

/**
 * Pastillas de estado. Son enlaces, no botones: filtrar es navegar.
 *
 * Conservan el resto de filtros (07/10): llevaban a `/cotizaciones?estado=…`
 * a secas, y pulsar «Enviadas» borraba el periodo y la búsqueda que se
 * acababan de poner. Y con borde y a 40 px, como el resto de botones.
 */
async function FiltroEstados({
  activo,
  sp,
}: {
  activo?: EstadoCotizacion;
  sp: Record<string, string | string[] | undefined>;
}) {
  const resultado = await conteoPorEstado();
  const conteo: Partial<Record<EstadoCotizacion, number>> = resultado.ok
    ? resultado.datos
    : {};
  // Los que se miran a diario, y desde el 07/10 también «Vencida»: con el
  // histórico cargado son 609, y son las que se pueden volver a ofrecer.
  const estados = ["borrador", "enviada", "aprobada", "atendida", "vencida"] as const;

  const enlace = (estado: EstadoCotizacion | null) => {
    const q = new URLSearchParams();
    for (const k of ["q", "cliente", "desde", "hasta", "n"]) {
      const v = uno(sp[k]);
      if (v) q.set(k, v);
    }
    if (estado) q.set("estado", estado);
    const s = q.toString();
    return s ? `/cotizaciones?${s}` : "/cotizaciones";
  };

  const clase = (seleccionado: boolean) =>
    `inline-flex h-10 items-center rounded-md border px-3 text-sm font-semibold transition-colors ${
      seleccionado
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={enlace(null)} className={clase(!activo)}>
        Todas
      </Link>
      {estados.map((e) => (
        <Link key={e} href={enlace(e)} className={clase(activo === e)}>
          {ETIQUETA_ESTADO[e]}
          {conteo[e] ? (
            <span className="ml-1.5 tabular opacity-75">{conteo[e]}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/** Las cuatro cifras de arriba (108). */
async function Indicadores({ filtros }: { filtros: FiltrosCotizaciones }) {
  const r = await indicadoresCotizaciones(filtros);
  if (!r.ok) return <IndicadoresError detalle={r.error} />;
  const d = r.datos;
  const periodo = textoPeriodo(filtros.desde, filtros.hasta);
  const tasa = d.decididas > 0 ? (d.aprobadas / d.decididas) * 100 : null;
  return (
    <FilaIndicadores
      items={[
        {
          etiqueta: "Cotizaciones",
          valor: d.cotizaciones.toLocaleString("es-PE"),
          detalle: `a ${d.clientes.toLocaleString("es-PE")} ${d.clientes === 1 ? "cliente" : "clientes"} · ${periodo}`,
          icono: <FileText aria-hidden="true" />,
        },
        {
          etiqueta: "Monto cotizado",
          valor: formatearMoneda(d.monto),
          detalle: "sin IGV, sin las anuladas",
          icono: <Target aria-hidden="true" />,
        },
        {
          etiqueta: "En juego",
          valor: formatearMoneda(d.montoEnJuego),
          detalle:
            d.vencenSemana > 0
              ? `${d.enJuego} sin respuesta · ${d.vencenSemana} vencen esta semana`
              : `${d.enJuego} sin enviar o esperando respuesta`,
          tono: d.vencenSemana > 0 ? "aviso" : undefined,
          icono: <Hourglass aria-hidden="true" />,
          href: "/cotizaciones?estado=enviada",
        },
        {
          etiqueta: "Se ganan",
          valor: tasa === null ? "—" : `${tasa.toLocaleString("es-PE", { maximumFractionDigits: 0 })} %`,
          detalle:
            tasa === null
              ? "todavía no se ha decidido ninguna"
              : `${d.aprobadas} de ${d.decididas} decididas · ${formatearMoneda(d.montoAprobado)}`,
          tono: tasa === null ? undefined : tasa >= 50 ? "ok" : "aviso",
          icono: <CircleCheck aria-hidden="true" />,
        },
      ]}
    />
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
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
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

      <Suspense
        key={`${filtros.desde}|${filtros.hasta}|${filtros.cliente}`}
        fallback={<Skeleton className="h-32 w-full" />}
      >
        <Indicadores filtros={filtros} />
      </Suspense>

      {/* Buscar y filtrar, en una caja: primero lo que se sabe —un número, un
          cliente—, luego el periodo, luego el estado. */}
      <section className="card flex flex-col gap-4 p-4">
        <Suspense fallback={<Skeleton className="h-11 w-full max-w-sm" />}>
          <BuscadorCotizaciones />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <BarraPeriodo />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-10 w-full max-w-xl" />}>
          <FiltroEstados activo={filtros.estado} sp={sp} />
        </Suspense>
      </section>

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
