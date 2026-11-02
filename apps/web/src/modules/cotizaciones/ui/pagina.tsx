import { Suspense } from "react";
import Link from "next/link";
import { seriesDe } from "@/lib/series";
import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";
import { CircleCheck, FileSpreadsheet, FileText, Hourglass, Plus, Target } from "lucide-react";
import { Skeleton, buttonVariants, cn, formatearMoneda, leerTamano } from "@rodatech/ui";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { PanelModulo } from "@/componentes/panel-modulo";
import { FilaIndicadores, IndicadoresError, textoPeriodo } from "@/componentes/indicadores";

import { conteoPorEstado, indicadoresCotizaciones } from "../api/consultas";
import {
  esEstadoCotizacion,
  type EstadoCotizacion,
  type FiltrosCotizaciones,
} from "../dominio/tipos";
import { FiltrosCotizacionesBarra } from "./filtros";
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

/*
  Los botones de la cabecera salen del sistema de diseño y no copiados a mano
  (revisión de entrega, 02/11). Cada lista llevaba los suyos —`h-9
  rounded-sm` en productos, `h-11` en clientes, `py-2` aquí— y ninguno tenía
  el relieve del rediseño del 30/10: de una pantalla a otra, el botón
  principal cambiaba de alto y de forma. 44 px en el teléfono, como
  `BotonBloqueado`, que es el que sale en su sitio sin permiso.

  El secundario va sobre el azul del panel, y el `hover:bg-brand-50` de
  `outline` es casi blanco: con la letra blanca del panel, el texto
  desaparecía al pasar el ratón. Ahí se aclara el vidrio en su lugar.
*/
const BOTON_PRINCIPAL = cn(buttonVariants({ variant: "primary" }), "h-11 md:h-control-md");
const BOTON_SECUNDARIO = cn(
  buttonVariants({ variant: "outline" }),
  "h-11 md:h-control-md hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
);

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
    serie: uno(sp.serie),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  const [conteo, series, cliente] = await Promise.all([
    conteoPorEstado(),
    seriesDe(["cotizacion"]),
    filtros.cliente ? nombreDelCliente(filtros.cliente) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/cotizaciones">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Precios en dólares, sin IGV en la columna de valor unitario.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              Exportar lo que se está viendo (14/10). Willy, 13/10, filtrando por
              cliente: *«y ahora ahí no hay la opción para exportarlo a Excel»*.
              El libro es el de Reportes (cotizaciones línea por línea), con el
              cliente, el periodo, el estado y la serie de esta lista. Sin
              periodo, los últimos 12 meses.
            */}
            <a
              href={`/reportes/excel?${new URLSearchParams(
                Object.entries({
                  tipo: "cotizaciones",
                  cliente: filtros.cliente ?? "",
                  desde: filtros.desde ?? "",
                  hasta: filtros.hasta ?? "",
                  estado: filtros.estado ?? "",
                  serie: filtros.serie ?? "",
                }).filter(([, v]) => v),
              ).toString()}`}
              className={BOTON_SECUNDARIO}
            >
              <FileSpreadsheet aria-hidden="true" />
              Exportar a Excel
            </a>
            <Link href="/cotizaciones/nueva" className={BOTON_PRINCIPAL}>
              <Plus strokeWidth={2.5} aria-hidden="true" />
              Nueva cotización
            </Link>
          </div>
        </div>

        <Suspense
          key={`${filtros.desde}|${filtros.hasta}|${filtros.cliente}`}
          fallback={<Skeleton className="h-32 w-full" />}
        >
          <Indicadores filtros={filtros} />
        </Suspense>
      </PanelModulo>

      {/* El periodo arriba y una fila de filtros debajo (12/10), como la
          barra que Luis enseñó de otro sistema. */}
      <section className="card flex flex-col gap-3 p-4">
        <Suspense fallback={<Skeleton className="h-11 w-full" />}>
          <BarraPeriodo />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <FiltrosCotizacionesBarra
            nombreCliente={cliente?.ok ? cliente.nombre : null}
            conteo={conteo.ok ? conteo.datos : {}}
            series={series}
          />
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
