import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

import { estadoConfiguracion } from "../api/configuracion";
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
        <div className="flex items-center gap-2">
          {esGerencia ? (
            <Link
              href="/facturacion/configuracion"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Configuración
            </Link>
          ) : null}
          {puedeFacturar ? (
            <Link
              href="/facturacion/nueva"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 size-5 shrink-0 text-[var(--warn)]"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>

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
                href="/facturacion/configuracion"
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

      <section className="card pt-4">
        <FiltrosFacturacionBarra
          nombreCliente={cliente?.ok ? cliente.nombre : null}
        />

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
