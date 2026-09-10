import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { nombreDelCliente } from "@/modules/clientes/acciones/buscar";

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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Preparar guía
          </Link>
        ) : null}
      </div>

      <section className="card pt-4">
        <FiltrosGuiasBarra nombreCliente={cliente?.ok ? cliente.nombre : null} />

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
