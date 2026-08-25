import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

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
  };

  const supabase = await clienteServidor();
  const [{ data: clientes }, perfil] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social")
      .eq("activo", true)
      .order("razon_social")
      .limit(500),
    perfilActual(),
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

        {puedeDespachar ? (
          <Link
            href="/guias/nueva"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Preparar guía
          </Link>
        ) : null}
      </div>

      <section className="card pt-4">
        <FiltrosGuiasBarra clientes={clientes ?? []} />

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
