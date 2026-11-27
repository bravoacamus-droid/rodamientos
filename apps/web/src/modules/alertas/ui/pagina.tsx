import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Badge,
  CifraAnimada,
  EstadoError,
  EstadoVacio,
  Skeleton,
  buttonVariants,
} from "@rodatech/ui";

import { bandeja, resumenBandeja } from "../api/consultas";
import {
  agruparPorFamilia,
  haceCuanto,
  tonoSeveridad,
} from "../dominio/alerta";
import {
  ETIQUETA_FAMILIA,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO,
  type Alerta,
  type FiltrosBandeja,
} from "../dominio/tipos";
import { AccionesAlerta, BotonMarcarTodas, BotonRefrescar } from "./acciones";
import { FiltrosBandejaBarra } from "./filtros";
import { PanelModulo } from "@/componentes/panel-modulo";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Alertas.
 *
 * Media pantalla, y hay que decirlo: esto es la mitad VISIBLE de una cola de
 * envío. `alertas.notificado_en` existe porque lo que Willy pidió fue que la
 * alerta le LLEGUE — *«pero no te llega como una alerta, tú tienes que entrar y
 * ver»* (25:21)—. El worker que empuja por WhatsApp o correo todavía no existe;
 * mientras tanto, esta bandeja es lo que hay. El cálculo SÍ es automático:
 * `generar_alertas()` corre cada día a las 07:00 de Lima desde la 032, y
 * «Actualizar» solo lo adelanta.
 *
 * Se agrupa por a-quién-le-toca y no por gravedad porque son personas
 * distintas: el quiebre de stock lo resuelve almacén y la factura vencida la
 * resuelve cobranzas. Ordenado por gravedad, cada uno tendría que leerse la
 * lista entera del otro.
 */
export default async function PaginaAlertas({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosBandeja = {
    q: uno(sp.q),
    severidad: uno(sp.severidad),
    tipo: uno(sp.tipo),
    familia: uno(sp.familia),
    ver: uno(sp.ver),
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/alertas">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Alertas</h1>
            <span className="mt-2 block h-2 w-24 -skew-x-[30deg] rounded-sm bg-accent-400" aria-hidden="true" />
            <p className="mt-2 max-w-3xl text-lg text-[var(--fg-muted)]">
              Lo que hay que mirar hoy: pedidos, guías y cotizaciones que se
              quedan atrás, quiebres, cartera vencida y documentos rechazados.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Suspense fallback={null}>
              <BotonesDeBandeja />
            </Suspense>
            <BotonRefrescar />
          </div>
        </div>

        <Suspense
          fallback={
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          }
        >
          <Indicadores />
        </Suspense>
      </PanelModulo>

      <section className="card pt-4">
        <FiltrosBandejaBarra />
        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <Bandeja filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * «Marcar N como leídas» necesita saber cuántas hay sin leer, así que va en su
 * propio Suspense: el botón de actualizar no tiene que esperar a esa consulta.
 */
async function BotonesDeBandeja() {
  const r = await resumenBandeja();
  if (!r.ok) return null;
  return <BotonMarcarTodas sinLeer={r.datos.sinLeer} />;
}

async function Indicadores() {
  const r = await resumenBandeja();
  if (!r.ok) {
    return <EstadoError titulo="No se pudo leer la bandeja" detalle={r.error} />;
  }

  const { total, sinLeer, criticas, ultima } = r.datos;
  const ahora = new Date();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card elev-1 anim-entrada min-w-0 p-4">
        <p className="text-base font-semibold text-[var(--fg-muted)]">Sin leer</p>
        <p className="tabular mt-1 text-3xl font-extrabold leading-tight text-[var(--titulo)]">
          <CifraAnimada valor={sinLeer} decimales={0} />
        </p>
        <p className="mt-1 text-base text-[var(--fg-muted)]">
          {total === 0 ? "la bandeja está vacía" : `de ${total} en la bandeja`}
        </p>
      </div>

      <div className="card elev-1 anim-entrada min-w-0 p-4">
        <p className="text-base font-semibold text-[var(--fg-muted)]">Críticas</p>
        <p
          className={`tabular mt-1 text-3xl font-extrabold leading-tight ${criticas > 0 ? "text-[var(--danger)]" : "text-[var(--titulo)]"}`}
        >
          <CifraAnimada valor={criticas} decimales={0} />
        </p>
        <p className="mt-1 text-base text-[var(--fg-muted)]">
          {criticas === 0
            ? "nada que pare la operación"
            : "quiebre, saldo negativo o rechazo de SUNAT"}
        </p>
      </div>

      <div className="card elev-1 anim-entrada min-w-0 p-4">
        {/*
          Decía «Última revisión: nunca · se calculan al pulsar Actualizar», y
          era falso: el cron de la 032 revisa todos los días a las 07:00 y ha
          corrido cada mañana. «nunca» salía de la fecha de la última alerta
          —no hay ninguna— y no de la última revisión. Leído así, la bandeja
          vacía parecía un sistema apagado (revisión por módulos del 02/10).
        */}
        <p className="text-base font-semibold text-[var(--fg-muted)]">Revisión automática</p>
        <p className="mt-1 text-2xl font-extrabold leading-tight text-[var(--titulo)]">cada día a las 7:00</p>
        <p className="mt-1 text-base text-[var(--fg-muted)]">
          {ultima
            ? `última alerta ${haceCuanto(ultima, ahora)}; «Actualizar» revisa ahora`
            : "«Actualizar» revisa ahora, sin esperar a mañana"}
        </p>
      </div>
    </div>
  );
}

async function Bandeja({ filtros }: { filtros: FiltrosBandeja }) {
  const r = await bandeja(filtros);
  if (!r.ok) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las alertas"
        descripcion="La consulta no llegó a completarse."
        detalle={r.error}
      />
    );
  }

  const archivadas = filtros.ver === "archivadas";

  if (r.datos.length === 0) {
    const filtrando = Boolean(
      filtros.q || filtros.severidad || filtros.tipo || filtros.familia,
    );
    return (
      <EstadoVacio
        titulo={
          filtrando
            ? "Nada coincide con el filtro"
            : archivadas
              ? "No hay nada archivado"
              : "No hay ninguna alerta"
        }
        descripcion={
          filtrando
            ? "Prueba con menos filtros."
            : archivadas
              ? "Aquí se guarda lo que ya se atendió."
              : "Todo en orden: la revisión de cada mañana no ha encontrado nada que mirar."
        }
      />
    );
  }

  const ahora = new Date();
  const grupos = agruparPorFamilia(r.datos);

  return (
    <div className="flex flex-col">
      {grupos.map((grupo) => (
        <section key={grupo.familia}>
          <h2 className="flex items-center gap-2 border-t border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-lg font-bold text-[var(--titulo)]">
            {ETIQUETA_FAMILIA[grupo.familia]}
            <span className="tabular rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-base font-bold text-[var(--fg-muted)] ring-1 ring-inset ring-[var(--border)]">
              {grupo.alertas.length}
            </span>
          </h2>
          <ul className="flex flex-col">
            {grupo.alertas.map((a, i) => (
              <FilaAlerta key={a.id} alerta={a} indice={i} ahora={ahora} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Una alerta.
 *
 * La franja de color de la izquierda hace el trabajo que en una tabla haría
 * una columna «gravedad»: se ve de un vistazo dónde está lo rojo sin leer nada.
 * Lo no leído va en negrita y con fondo; lo leído se apaga pero no desaparece.
 */
function FilaAlerta({
  alerta,
  indice,
  ahora,
}: {
  alerta: Alerta;
  indice: number;
  ahora: Date;
}) {
  const grave = alerta.severidad === "critica" || alerta.severidad === "alta";

  const franja = grave
    ? "border-l-[var(--danger)]"
    : alerta.severidad === "media"
      ? "border-l-[var(--warn)]"
      : "border-l-[var(--border)]";

  return (
    <li
      // En el teléfono los botones van DEBAJO del texto: al lado dejaban el
      // mensaje en una columna de 150 px (revisión por módulos del 02/10).
      className={`anim-entrada flex flex-col items-stretch gap-2 border-b sm:flex-row sm:items-start sm:gap-3 border-l-[6px] border-[var(--border-soft)] px-4 py-4 transition-colors hover:bg-[var(--surface-2)] ${franja} ${
        alerta.leida ? "opacity-70" : ""
      }`}
      style={{ animationDelay: `${Math.min(indice, 6) * 28}ms` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`text-lg leading-snug ${alerta.leida ? "font-medium" : "font-bold"}`}>
            {alerta.titulo}
          </span>
          <Badge tone={tonoSeveridad(alerta.severidad)}>
            {ETIQUETA_SEVERIDAD[alerta.severidad]}
          </Badge>
          <span className="text-sm text-[var(--fg-muted)]">
            {ETIQUETA_TIPO[alerta.tipo]}
          </span>
          {!alerta.leida ? (
            // «Nueva» con palabra (27/11): un punto azul de 6 px no lo ve Willy
            // y no dice qué significa sin pasar el ratón.
            <span className="rounded-full bg-[var(--info-bg)] px-2.5 py-0.5 text-sm font-bold text-[var(--info)] ring-1 ring-inset ring-[var(--border)]">
              Nueva
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-base text-[var(--fg-muted)]">{alerta.mensaje}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--fg-muted)]">
          <span className="tabular">{haceCuanto(alerta.generada_en, ahora)}</span>
          {alerta.accion_url ? (
            // Botón con borde y flecha de lucide, no un enlace azul con «→»
            // de texto (revisión por módulos del 02/10; CLAUDE.md §1 y §5).
            <Link
              href={alerta.accion_url}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ir a arreglarlo
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
          {/* Se enseña porque distingue «ya te avisamos por WhatsApp» de «esto
              solo está aquí dentro», y es media pregunta menos al llamar. */}
          {alerta.notificado_en ? <span>avisada</span> : null}
        </div>
      </div>

      {alerta.archivada ? null : (
        <AccionesAlerta id={alerta.id} leida={alerta.leida} />
      )}
    </li>
  );
}
