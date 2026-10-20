import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, FileX2, SendHorizontal, ShieldAlert, TriangleAlert, Truck } from "lucide-react";
import { EstadoError, Moneda, formatearFecha, formatearFechaHora } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";
import { misPermisos } from "@/lib/permisos";

import { FilaIndicadores } from "@/componentes/indicadores";
import { estadoConfiguracion } from "@/modules/facturacion/api/configuracion";
import { ETIQUETA_TIPO } from "@/modules/facturacion/dominio/tipos";

import { bandejaSunat } from "../api/consultas";
import { bajasPorFecha, plazoDeEnvio, type DocumentoBandeja } from "../dominio/bandeja";
import { BotonBaja, BotonEnviar, BotonEnviarGuias } from "./botones";

/**
 * SUNAT: todo lo que espera algo de SUNAT, en un solo sitio (15/10).
 *
 * Luis: *«un módulo para que me avise ahí las que todavía no manda… y ver
 * los estados si fue rechazado o así; más que todo es para el cliente»*.
 * Para Willy: abre, y lo primero que ve es si hay algo que hacer y el botón
 * para hacerlo. Cuando está todo al día, lo dice en verde y nada más.
 */

const TONO = {
  ok: "text-[var(--ok)]",
  aviso: "text-[var(--warn)]",
  urgente: "text-[var(--danger)]",
} as const;

export default async function PaginaSunat() {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  const permisos = await misPermisos();
  if (!permisos.tiene("facturacion", "ver")) redirect("/dashboard");

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const [config, bandeja] = await Promise.all([estadoConfiguracion(), bandejaSunat(hoy)]);
  // El enlace a la configuración y las bajas, cada uno con su permiso (143).
  const esGerencia = permisos.tiene("configuracion", "ver");
  const puedeDarDeBaja = permisos.tiene("facturacion", "eliminar");

  if (!bandeja.ok) {
    return <EstadoError titulo="No se pudo leer el estado de SUNAT" detalle={bandeja.error} />;
  }
  const b = bandeja.datos;
  const grupos = bajasPorFecha(b.porDarDeBaja);
  const bajasEnCurso = b.bajas.filter((x) => x.estado === "enviada");
  const todoAlDia = b.guias.length === 0 && b.porEnviar.length === 0 && b.rechazados.length === 0 && b.porDarDeBaja.length === 0 && bajasEnCurso.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SUNAT</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Lo que falta mandar, lo que SUNAT rechazó y las anulaciones que todavía no sabe.
        </p>
      </div>

      {!config.guias.listo ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-sm">
          <p className="font-semibold">
            {config.listo ? "Las facturas ya se pueden enviar; las guías todavía no." : "Todavía no está conectado con SUNAT."}
          </p>
          <ul className="mt-1 list-inside list-disc">
            {config.guias.faltan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2">
            Se puede facturar igual: lo emitido se junta aquí y se manda cuando esté listo.{" "}
            {esGerencia ? (
              <Link href="/configuracion/sunat" className="font-medium underline">
                Ir a «SUNAT y numeración»
              </Link>
            ) : null}
          </p>
        </div>
      ) : config.ambiente === "beta" ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <strong>Modo de pruebas de SUNAT.</strong> Lo que se mande ahora no cuenta como declarado.
        </p>
      ) : null}

      <FilaIndicadores
        items={[
          {
            etiqueta: "Por enviar",
            valor: String(b.porEnviar.length),
            detalle: b.porEnviar.length > 0 ? "emitidos que SUNAT no tiene" : "nada pendiente",
            tono: b.porEnviar.length > 0 ? "aviso" : "ok",
            icono: <SendHorizontal aria-hidden="true" />,
            href: "#por-enviar",
          },
          {
            etiqueta: "Rechazados",
            valor: String(b.rechazados.length),
            detalle: b.rechazados.length > 0 ? "hay que corregirlos" : "ninguno",
            tono: b.rechazados.length > 0 ? "urgente" : "ok",
            icono: <ShieldAlert aria-hidden="true" />,
            href: "#rechazados",
          },
          {
            etiqueta: "Bajas por comunicar",
            valor: String(b.porDarDeBaja.length),
            detalle: b.porDarDeBaja.length > 0 ? "anulados que SUNAT cree vivos" : "ninguna",
            tono: b.porDarDeBaja.length > 0 ? "aviso" : "ok",
            icono: <FileX2 aria-hidden="true" />,
            href: "#bajas",
          },
          {
            etiqueta: "Guías sin aceptar",
            valor: String(b.guias.length),
            detalle: b.guias.length > 0 ? "no deberían salir así" : `ninguna · ${b.aceptadosMes} comprobantes aceptados este mes`,
            tono: b.guias.length > 0 ? "urgente" : "ok",
            icono: <Truck aria-hidden="true" />,
            href: "#guias",
          },
        ]}
      />

      {todoAlDia ? (
        <div className="flex items-center gap-3 rounded-md border border-[var(--ok)] bg-[var(--surface)] p-4">
          <CircleCheck className="size-7 shrink-0 text-[var(--ok)]" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold">Todo al día con SUNAT.</p>
            <p className="text-sm text-[var(--fg-muted)]">No hay nada por enviar, rechazado ni por dar de baja.</p>
          </div>
        </div>
      ) : null}

      {/* ----------------------------------------------------------- Guías */}
      {b.guias.length > 0 ? (
        <section id="guias" className="card flex flex-col gap-3 border-[var(--danger)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Guías sin aceptar ({b.guias.length})</h2>
              <p className="text-sm text-[var(--fg-muted)]">
                Una guía tiene que estar aceptada por SUNAT ANTES de que salga la mercadería. Si paran el camión,
                una guía que SUNAT no tiene es como no llevar guía.
              </p>
            </div>
            <BotonEnviarGuias
              guias={b.guias.filter((g) => g.estado_sunat !== "enviado").map((g) => ({ id: g.id, numero: g.numero }))}
              etiqueta={b.guias.length === 1 ? "Enviar la guía a SUNAT" : `Enviar las ${b.guias.length} guías`}
              principal
              deshabilitado={!config.guias.listo}
            />
          </div>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {b.guias.map((g) => (
              <li key={g.id} className="flex flex-col gap-0.5 py-3">
                <p className="flex flex-wrap items-baseline gap-x-2 text-base">
                  <Link href={`/guias/${g.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
                    {g.numero}
                  </Link>
                  <span className="text-sm text-[var(--fg-muted)]">
                    Guía · emitida {formatearFecha(g.fecha_emision)} · traslado {formatearFecha(g.fecha_traslado)}
                  </span>
                </p>
                <p className="text-sm">{g.cliente}</p>
                <p
                  className={`text-sm font-medium ${g.estado_sunat === "rechazado" ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}
                >
                  {g.estado_sunat === "rechazado"
                    ? `Rechazada: ${g.mensaje ?? "sin detalle"}`
                    : g.estado_sunat === "enviado"
                      ? "Enviada: SUNAT la está revisando (ábrela para preguntar)."
                      : "Todavía no se mandó."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------ Por enviar */}
      {b.porEnviar.length > 0 ? (
        <section id="por-enviar" className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Por enviar ({b.porEnviar.length})</h2>
              <p className="text-sm text-[var(--fg-muted)]">
                SUNAT pide recibirlos dentro de los 3 días siguientes a la emisión.
              </p>
            </div>
            <BotonEnviar
              ids={b.porEnviar.map((d) => d.id)}
              etiqueta={b.porEnviar.length === 1 ? "Enviar a SUNAT" : `Enviar las ${b.porEnviar.length} a SUNAT`}
              principal
              deshabilitado={!config.listo}
            />
          </div>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {b.porEnviar.map((d) => {
              const plazo = plazoDeEnvio(d.fecha_emision, hoy);
              return (
                <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <Documento d={d}>
                    <p className={`text-sm font-medium ${TONO[plazo.tono]}`}>{plazo.texto}</p>
                  </Documento>
                  {/* Con una sola, el botón de arriba ya es el suyo. */}
                  {b.porEnviar.length > 1 ? (
                    <BotonEnviar ids={[d.id]} etiqueta="Enviar esta" deshabilitado={!config.listo} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------ Rechazados */}
      {b.rechazados.length > 0 ? (
        <section id="rechazados" className="card flex flex-col gap-3 border-[var(--danger)] p-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--danger)]">Rechazados por SUNAT ({b.rechazados.length})</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Un rechazado no vale ante SUNAT. Cada uno dice qué pasó y qué hacer.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {b.rechazados.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <Documento d={d}>
                  <p className="text-sm">
                    <strong>Qué pasó:</strong> {d.motivo}
                    {d.codigo ? <span className="text-[var(--fg-muted)]"> (código {d.codigo})</span> : null}
                  </p>
                  <p className="text-sm">
                    <strong>Qué hacer:</strong> {d.queHacer}
                  </p>
                </Documento>
                {d.reintentable ? (
                  <BotonEnviar ids={[d.id]} etiqueta="Volver a enviar" deshabilitado={!config.listo} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- Bajas */}
      {b.porDarDeBaja.length > 0 || bajasEnCurso.length > 0 ? (
        <section id="bajas" className="card flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-lg font-semibold">Bajas por comunicar</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Comprobantes anulados aquí que SUNAT ya había aceptado. Hasta comunicar la baja, para SUNAT siguen vigentes.
              Se manda una comunicación por cada fecha de emisión.
            </p>
          </div>
          {grupos.map((g) => (
            <div key={g.fecha} className="rounded-sm border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-semibold">Emitidos el {formatearFecha(g.fecha)}</p>
                {puedeDarDeBaja ? (
                  config.listo ? (
                    <BotonBaja fecha={g.fecha} />
                  ) : null
                ) : (
                  <p className="text-sm text-[var(--fg-muted)]">La comunica quien puede anular facturas.</p>
                )}
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {g.documentos.map((d) => (
                  <li key={d.id}>
                    <Documento d={d}>
                      {d.motivo_anulacion ? (
                        <p className="text-sm text-[var(--fg-muted)]">Anulada: {d.motivo_anulacion}</p>
                      ) : null}
                    </Documento>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {bajasEnCurso.map((x) => (
            <div key={x.id} className="flex flex-col gap-2 rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold">
                  <TriangleAlert className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
                  {x.identificador}: SUNAT la está revisando
                </p>
                <p>
                  {x.documentos.join(", ")} · enviada el {formatearFechaHora(x.creado_en)}
                </p>
              </div>
              <BotonBaja bajaId={x.id} />
            </div>
          ))}
        </section>
      ) : null}

      {/* ----------------------------------------------- Últimos aceptados */}
      {b.ultimosAceptados.length > 0 ? (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-lg font-semibold">Últimos aceptados</h2>
          <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
            {b.ultimosAceptados.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <CircleCheck className="size-5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                <Documento d={d} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Un comprobante en la bandeja: qué es, de quién y cuánto, con enlace a su ficha. */
function Documento({ d, children }: { d: DocumentoBandeja; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-base">
        <Link href={`/facturacion/${d.id}`} className="font-mono font-semibold text-brand-600 hover:underline">
          {d.numero}
        </Link>
        <span className="text-sm text-[var(--fg-muted)]">
          {ETIQUETA_TIPO[d.tipo]} · {formatearFecha(d.fecha_emision)}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="min-w-0 truncate">{d.cliente}</span>
        <Moneda valor={d.total} moneda={d.moneda} tamano="sm" />
      </p>
      {children}
    </div>
  );
}
