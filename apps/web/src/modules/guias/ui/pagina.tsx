import { Suspense } from "react";
import Link from "next/link";
import { FilePen, FileWarning, Plus, ShieldCheck, Truck } from "lucide-react";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { BarraPeriodo } from "@/componentes/barra-periodo";
import { FilaIndicadores, IndicadoresError, textoPeriodo } from "@/componentes/indicadores";
import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

import { indicadoresGuias } from "../api/consultas";

import type { FiltrosGuias } from "../dominio/tipos";
import { FiltrosGuiasBarra } from "./filtros";
import { TablaGuias } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Guías de remisión.
 *
 * Es el documento que acompaña la mercadería, y **el único sitio por el que el
 * stock sale del almacén** en el curso normal de una venta. La factura no lo
 * descarga: lo dice el propio comentario de `emitir_guia()` en la base.
 */
export default async function PaginaGuias({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosGuias = {
    q: uno(sp.q),
    cliente: uno(sp.cliente),
    estado: uno(sp.estado),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  /* Ya no se traen 500 clientes en cada carga para llenar un desplegable:
     el filtro busca contra el servidor. De aquí solo sale el nombre del que
     esté filtrado, para poder pintarlo. */
  const [perfil, cliente] = await Promise.all([
    perfilActual(),
    filtros.cliente ? nombreDelCliente(filtros.cliente) : Promise.resolve(null),
  ]);

  const rol = perfil?.activo ? perfil.rol : null;
  const puedeDespachar =
    rol !== null && ["gerencia", "admin", "ventas", "almacen"].includes(rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Guías de remisión</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Acompañan la mercadería cuando sale. Emitir una guía es lo que descarga el
            stock.
          </p>
        </div>

        {/*
          El «+» delante, como en el prototipo de Luis (10/09).

          No es adorno: es el único botón de la pantalla que CREA algo. El
          resto —Ver, Imprimir— trabaja sobre lo que ya está, y un icono que
          solo lleva el que crea es una pista que se lee antes que el texto.
        */}
        {puedeDespachar ? (
          <Link
            href="/guias/nueva"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus strokeWidth={2.5} className="size-4" aria-hidden="true" />
            Preparar guía
          </Link>
        ) : null}
      </div>

      <Suspense
        key={`${filtros.desde}|${filtros.hasta}|${filtros.cliente}`}
        fallback={<Skeleton className="h-32 w-full" />}
      >
        <Indicadores filtros={filtros} />
      </Suspense>

      <section className="card pt-4">
        <FiltrosGuiasBarra nombreCliente={cliente?.ok ? cliente.nombre : null} />
        <div className="border-t border-[var(--border-soft)] px-4 py-4">
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <BarraPeriodo />
          </Suspense>
        </div>

        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaGuias filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}

/** Las cuatro cifras de guías (07/10). */
async function Indicadores({ filtros }: { filtros: FiltrosGuias }) {
  const r = await indicadoresGuias(filtros);
  if (!r.ok) return <IndicadoresError detalle={r.error} />;
  const d = r.datos;
  return (
    <FilaIndicadores
      items={[
        {
          etiqueta: "Emitidas",
          valor: d.emitidas.toLocaleString("es-PE"),
          detalle: `guías que ya sacaron mercadería · ${textoPeriodo(filtros.desde, filtros.hasta)}`,
          icono: <Truck aria-hidden="true" />,
        },
        {
          etiqueta: "Sin facturar",
          valor: d.sinFacturar.toLocaleString("es-PE"),
          detalle:
            d.sinFacturar > 0
              ? `la más antigua lleva ${d.diasSinFacturar ?? 0} días fuera sin factura`
              : "todo lo despachado está facturado",
          tono: d.sinFacturar > 0 ? ((d.diasSinFacturar ?? 0) > 7 ? "urgente" : "aviso") : "ok",
          icono: <FileWarning aria-hidden="true" />,
          href: "/facturacion/nueva",
        },
        {
          etiqueta: "Borradores",
          valor: d.borradores.toLocaleString("es-PE"),
          detalle: d.borradores > 0 ? "preparadas y sin emitir: no han descargado stock" : "ninguna a medio preparar",
          tono: d.borradores > 0 ? "aviso" : undefined,
          icono: <FilePen aria-hidden="true" />,
          href: d.borradores > 0 ? "/guias?estado=borrador" : undefined,
        },
        {
          etiqueta: "Con SUNAT",
          valor: d.sinSunat > 0 ? `${d.sinSunat} sin declarar` : "Al día",
          detalle:
            d.sinSunat > 0
              ? "el envío de guías a SUNAT aún no está activo"
              : `${d.anuladas} ${d.anuladas === 1 ? "anulada" : "anuladas"} en el periodo`,
          tono: d.sinSunat > 0 ? "aviso" : "ok",
          icono: <ShieldCheck aria-hidden="true" />,
        },
      ]}
    />
  );
}
