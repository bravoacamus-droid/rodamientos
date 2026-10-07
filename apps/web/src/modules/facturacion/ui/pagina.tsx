import { Suspense } from "react";
import Link from "next/link";
import { Ban, ShieldCheck, Info, Plus, Receipt, Settings, Wallet } from "lucide-react";
import { Skeleton, buttonVariants, cn, formatearMoneda, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FilaIndicadores, IndicadoresError, textoPeriodo } from "@/componentes/indicadores";
import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

import { estadoConfiguracion } from "../api/configuracion";
import { indicadoresFacturacion } from "../api/consultas";
import type { FiltrosComprobantes } from "../dominio/tipos";
import { FiltrosFacturacionBarra } from "./filtros";
import { TablaComprobantes } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Facturación.
 *
 * El aviso de configuración va ARRIBA y no escondido en ajustes: mientras no
 * haya certificado se puede emitir y cobrar, pero nada llega a SUNAT, y eso
 * hay que verlo cada vez que se entra, no descubrirlo en la inspección.
 */
export default async function PaginaFacturacion({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosComprobantes = {
    q: uno(sp.q),
    cliente: uno(sp.cliente),
    tipo: uno(sp.tipo),
    estado: uno(sp.estado),
    sunat: uno(sp.sunat),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  /*
    Ya no se traen los clientes.

    Eran 500 en CADA carga de la página, se filtrara por cliente o no, para
    llenar un desplegable que casi nunca se abría. Ahora el filtro busca contra
    el servidor mientras se teclea, y de aquí solo sale el nombre del que esté
    filtrado —una fila— para poder pintarlo sin que el chip diga «cliente
    8f3a…».
  */
  const [perfil, config, cliente] = await Promise.all([
    perfilActual(),
    estadoConfiguracion(),
    filtros.cliente ? nombreDelCliente(filtros.cliente) : Promise.resolve(null),
  ]);

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeFacturar = rol !== null && ["gerencia", "admin", "ventas"].includes(rol);
  const esGerencia = rol !== null && ["gerencia", "admin"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Facturas y boletas electrónicas. Cierran el ciclo comercial.
          </p>
        </div>

        {/*
          Los dos con icono, como el prototipo de Luis (10/09).

          Y no son intercambiables: el engranaje va en el que ajusta y el «+»
          en el que crea. Es la misma regla que en guías — el icono lo lleva el
          que crea algo— con una segunda pista aquí, porque en esta pantalla
          hay dos botones juntos y uno de ellos no se toca casi nunca.
        */}
        {/* Con `buttonVariants`, los mismos 40 px y el mismo radio que
            «Volver» y que los botones de la ficha (revisión por módulos del
            02/10): había tres alturas y dos radios entre lista y ficha. */}
        <div className="flex flex-wrap items-center gap-2">
          {esGerencia ? (
            <Link
              href="/configuracion/sunat"
              className={cn(buttonVariants({ variant: "outline" }), "px-3")}
            >
              <Settings className="size-4" aria-hidden="true" />
              Configuración
            </Link>
          ) : null}
          {puedeFacturar ? (
            <Link
              href="/facturacion/nueva"
              className={cn(buttonVariants({ variant: "primary" }), "px-3")}
            >
              <Plus strokeWidth={2.5} className="size-4" aria-hidden="true" />
              Emitir comprobante
            </Link>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------- Aviso de estado */}
      {/*
        El aviso, con su icono, como en el prototipo de Luis (10/09).

        Un bloque ámbar a ancho completo se confunde con una sección más de la
        página; el icono lo marca como aviso antes de leer la frase. Y la lista
        sube de 12,8 px a 14: es lo que hay que ir tachando para poder facturar
        de verdad, no una nota al pie.
      */}
      {!config.listo ? (
        <div className="anim-entrada flex gap-3 rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          <Info
            className="mt-0.5 size-5 shrink-0 text-[var(--warn)]"
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="font-medium">
              Se puede emitir y cobrar, pero nada llega a SUNAT todavía.
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {config.faltan.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            {esGerencia ? (
              <Link
                href="/configuracion/sunat"
                className="mt-2 inline-block font-medium underline"
              >
                Ir a configurarlo
              </Link>
            ) : null}
          </div>
        </div>
      ) : config.ambiente === "beta" ? (
        <p className="anim-entrada rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <strong>Homologación (beta).</strong> Lo que se emita se envía a SUNAT,
          pero <strong>no tiene valor fiscal</strong>. Es lo correcto hasta terminar
          las pruebas.
        </p>
      ) : null}

      {config.avisoCaducidad ? (
        <p className="anim-entrada rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          {config.avisoCaducidad}
        </p>
      ) : null}

      <Suspense
        key={`${filtros.desde}|${filtros.hasta}|${filtros.cliente}`}
        fallback={<Skeleton className="h-32 w-full" />}
      >
        <Indicadores filtros={filtros} />
      </Suspense>

      {/* `@container`: la tabla y los filtros se deciden por el ancho de esta
          caja, no de la pantalla (revisión por módulos del 02/10). */}
      <section className="card @container pt-4">
        <FiltrosFacturacionBarra
          nombreCliente={cliente?.ok ? cliente.nombre : null}
        />
        <div className="border-t border-[var(--border-soft)] px-4 py-4">
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <BarraPeriodo />
          </Suspense>
        </div>

        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaComprobantes filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * Las cuatro cifras de facturación (07/10): lo facturado, lo que falta
 * cobrar de eso, lo que se devolvió o anuló, y cómo está con SUNAT.
 */
async function Indicadores({ filtros }: { filtros: FiltrosComprobantes }) {
  const r = await indicadoresFacturacion(filtros);
  if (!r.ok) return <IndicadoresError detalle={r.error} />;
  const d = r.datos;
  const sinRespuesta = d.sunatPendiente + d.sunatProblema;
  return (
    <FilaIndicadores
      items={[
        {
          etiqueta: "Facturado",
          valor: formatearMoneda(d.venta),
          detalle: `${d.documentos.toLocaleString("es-PE")} comprobantes · sin IGV · ${textoPeriodo(filtros.desde, filtros.hasta)}`,
          icono: <Receipt aria-hidden="true" />,
        },
        {
          etiqueta: "Falta cobrar",
          valor: formatearMoneda(d.saldo),
          detalle: d.vencido > 0 ? `${formatearMoneda(d.vencido)} ya vencido` : "nada fuera de plazo",
          tono: d.vencido > 0 ? "urgente" : d.saldo > 0 ? "aviso" : "ok",
          icono: <Wallet aria-hidden="true" />,
          href: "/cobranzas",
        },
        {
          etiqueta: "Devuelto y anulado",
          valor: formatearMoneda(d.notasMonto),
          detalle: `${d.notas} ${d.notas === 1 ? "nota de crédito" : "notas de crédito"} · ${d.anuladas} ${d.anuladas === 1 ? "anulada" : "anuladas"}`,
          icono: <Ban aria-hidden="true" />,
        },
        {
          etiqueta: "Con SUNAT",
          valor: sinRespuesta > 0 ? `${sinRespuesta} pendientes` : "Todo aceptado",
          detalle:
            sinRespuesta > 0
              ? `${d.sunatProblema} observados o rechazados · ${d.sunatAceptado} aceptados`
              : `${d.sunatAceptado.toLocaleString("es-PE")} aceptados`,
          tono: d.sunatProblema > 0 ? "urgente" : sinRespuesta > 0 ? "aviso" : "ok",
          icono: <ShieldCheck aria-hidden="true" />,
          href: sinRespuesta > 0 ? "/facturacion?sunat=pendiente" : undefined,
        },
      ]}
    />
  );
}
