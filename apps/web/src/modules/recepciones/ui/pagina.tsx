import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresActivos } from "../api/consultas";
import type { FiltrosRecepciones } from "../dominio/tipos";
import { FiltrosRecepcionesBarra } from "./filtros";
import { TablaRecepciones } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Recepciones de mercadería.
 *
 * Es el registro de todo lo que ha entrado al almacén. Willy fue explícito
 * (25:21): el stock se mueve al RECIBIR, no con la orden ni con la factura, y
 * `recepcionar_mercaderia()` es el único camino por el que entra.
 */
export default async function PaginaRecepciones({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosRecepciones = {
    q: uno(sp.q),
    proveedor: uno(sp.proveedor),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  const [proveedores, perfil] = await Promise.all([
    proveedoresActivos(),
    perfilActual(),
  ]);

  // Que el botón aparezca y luego rebote es peor que no verlo. La lista es la
  // misma que `permisos_rol` tiene para `recepciones`.
  const puedeRecibir =
    perfil !== null &&
    perfil.activo &&
    ["gerencia", "admin", "almacen", "compras"].includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recepciones</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que entra al almacén. Es lo único que mueve el stock.
          </p>
        </div>

        {puedeRecibir ? (
          <Link
            href="/recepciones/nueva"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Recibir mercadería
          </Link>
        ) : null}
      </div>

      <section className="card pt-4">
        <FiltrosRecepcionesBarra
          proveedores={proveedores.ok ? proveedores.datos : []}
        />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaRecepciones filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
