import { Suspense } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

import { opcionesDeFiltro } from "../api/consultas";
import type { FiltrosProductos } from "../dominio/tipos";
import { FiltrosProductosBarra } from "./filtros";
import { ResumenProductos } from "./resumen";
import { PreciosPorMarca } from "./precios-por-marca";
import { TablaProductos } from "./tabla";
import { PanelModulo } from "@/componentes/panel-modulo";

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
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
    archivados: uno(sp.archivados) === "1",
  };

  const [opciones, permisos] = await Promise.all([opcionesDeFiltro(), misPermisos()]);
  // Configuración › Roles y permisos (143). Sin permiso, el botón sale con candado y
  // dice por qué, en vez de esconderse (QA, 20/10).
  const puedeCrear = permisos.tiene("productos", "crear");
  const puedeEditar = permisos.tiene("productos", "editar");
  const catalogos = opciones.ok
    ? opciones.datos
    : { marcas: [], familias: [], subfamilias: [] };

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/productos">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {/* Sin «maestro» ni «jerarquía de tres niveles», que eran palabras
                  nuestras (revisión por módulos del 02/10). */}
              Todos los productos que vendes, con su stock y su precio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              Bajar el catálogo (Luis, 21/10: «descargar en Excel todos los
              productos… por familia, sub, activos o no»). Lleva los filtros de
              la lista: lo que se ve es lo que se baja. Basta con «Ver».
            */}
            <a
              href={`/productos/excel?${new URLSearchParams(
                Object.entries({
                  q: filtros.q ?? "",
                  marca: filtros.marca ?? "",
                  familia: filtros.familia ?? "",
                  subfamilia: filtros.subfamilia ?? "",
                  archivados: filtros.archivados ? "1" : "",
                }).filter(([, v]) => v),
              ).toString()}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Descargar en Excel
            </a>
            {/* Subir o bajar la lista de una marca de una vez (155). */}
            {puedeEditar ? <PreciosPorMarca marcas={catalogos.marcas} /> : null}
            {puedeCrear ? (
              <>
                <Link
                  href="/productos/cargar"
                  className="inline-flex h-9 items-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
                >
                  Cargar desde Excel
                </Link>
                <Link
                  href="/productos/nuevo"
                  className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Nuevo producto
                </Link>
              </>
            ) : (
              <BotonBloqueado mensaje={avisoSinPermiso("productos", "crear", permisos.nombreRol)} className="h-9 md:h-9">
                Nuevo producto
              </BotonBloqueado>
            )}
          </div>
        </div>

        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <ResumenProductos />
        </Suspense>
      </PanelModulo>

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
