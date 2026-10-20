import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

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
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  const [proveedores, permisos] = await Promise.all([
    proveedoresActivos(),
    misPermisos(),
  ]);

  // Configuración › Roles y permisos (143). Sin permiso, el botón sale con candado y
  // dice por qué, en vez de esconderse (QA, 20/10).
  const puedeRecibir = permisos.tiene("almacen", "crear");

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
        ) : (
          <BotonBloqueado mensaje={avisoSinPermiso("almacen", "crear", permisos.nombreRol)} className="h-9 md:h-9">
            Recibir mercadería
          </BotonBloqueado>
        )}
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
