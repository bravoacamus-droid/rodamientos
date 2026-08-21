import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { opcionesDeFiltro } from "../api/consultas";
import type { FiltrosProductos } from "../dominio/tipos";
import { FiltrosProductosBarra } from "./filtros";
import { ResumenProductos } from "./resumen";
import { TablaProductos } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Maestro de productos.
 *
 * Conserva la composición que aprobó el cliente: indicadores arriba, barra de
 * filtros, tabla y paginación.
 *
 * Cada sección va en su propio Suspense para que la tabla no espere a los
 * indicadores ni a los catálogos de los desplegables.
 */
export default async function PaginaProductos({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosProductos = {
    q: uno(sp.q),
    marca: uno(sp.marca),
    familia: uno(sp.familia),
    subfamilia: uno(sp.subfamilia),
    tipo: uno(sp.tipo),
    cursor: uno(sp.cursor),
    archivados: uno(sp.archivados) === "1",
  };

  const [opciones, perfil] = await Promise.all([opcionesDeFiltro(), perfilActual()]);
  // Solo quien mantiene el maestro ve el botón. Que aparezca y luego rebote es
  // peor que no verlo.
  const puedeCrear =
    perfil !== null &&
    perfil.activo &&
    ["gerencia", "admin", "compras"].includes(perfil.rol);
  const catalogos = opciones.ok
    ? opciones.datos
    : { marcas: [], familias: [], subfamilias: [] };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Maestro del catálogo: código, marca y jerarquía de tres niveles.
          </p>
        </div>

        {puedeCrear ? (
          <div className="flex items-center gap-2">
            <Link
              href="/productos/cargar"
              className="inline-flex h-9 items-center rounded-sm border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Cargar desde Excel
            </Link>
            <Link
              href="/productos/nuevo"
              className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Nuevo producto
            </Link>
          </div>
        ) : null}
      </div>

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <ResumenProductos />
      </Suspense>

      <section className="card pt-4">
        <FiltrosProductosBarra
          marcas={catalogos.marcas}
          familias={catalogos.familias}
          subfamilias={catalogos.subfamilias}
        />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaProductos filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
