import { Suspense } from "react";
import Link from "next/link";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Skeleton, buttonVariants, cn } from "@rodatech/ui";
import { leerCuantos } from "@/lib/ver-mas";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

import { opcionesDeFiltroRecepciones, proveedoresActivos } from "../api/consultas";
import { filtrosRecepcionesAQuery, leerFiltrosRecepciones } from "../dominio/filtros";
import type { FiltrosRecepciones } from "../dominio/tipos";
import { FiltrosRecepcionesBarra } from "./filtros";
import { ResumenRecepciones } from "./resumen";
import { TablaRecepciones } from "./tabla";
import { PanelModulo } from "@/componentes/panel-modulo";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
    // Todos los filtros, ya limpios (19/11): los mismos que leen el Excel y el PDF.
    ...leerFiltrosRecepciones(sp),
    // Sin páginas (19/11): la lista empieza en 30 y crece con «Ver más».
    limite: leerCuantos(sp.n),
  };

  const [proveedores, permisos, opciones] = await Promise.all([
    proveedoresActivos(),
    misPermisos(),
    opcionesDeFiltroRecepciones(),
  ]);
  const o = opciones.ok ? opciones.datos : { familias: [], subfamilias: [], marcas: [], usuarios: [] };
  const query = filtrosRecepcionesAQuery(filtros);
  const sufijo = query ? `?${query}` : "";
  const botonSecundario = cn(
    buttonVariants({ variant: "outline" }),
    "h-11 md:h-control-md hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
  );

  // Configuración › Roles y permisos (143). Sin permiso, el botón sale con candado y
  // dice por qué, en vez de esconderse (QA, 20/10).
  const puedeRecibir = permisos.tiene("almacen", "crear");

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/recepciones">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Recepciones</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Lo que entra al almacén. Es lo único que mueve el stock.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bajar lo filtrado (Luis, 19/11), todo lo que coincide y no solo la página. */}
            <a href={`/recepciones/excel${sufijo}`} className={botonSecundario}>
              <FileSpreadsheet aria-hidden="true" />
              Descargar en Excel
            </a>
            <a href={`/recepciones/pdf${sufijo}`} target="_blank" rel="noopener" className={botonSecundario}>
              <FileDown aria-hidden="true" />
              Descargar PDF
            </a>
            {puedeRecibir ? (
              <Link href="/recepciones/nueva" className={cn(buttonVariants(), "h-11 md:h-control-md")}>
                Recibir mercadería
              </Link>
            ) : (
              <BotonBloqueado mensaje={avisoSinPermiso("almacen", "crear", permisos.nombreRol)}>
                Recibir mercadería
              </BotonBloqueado>
            )}
          </div>
        </div>

        {/* Lo que entró, arriba y dentro del panel (19/11), como en el kardex. */}
        <Suspense key={query} fallback={<Skeleton className="h-28 w-full bg-white/10" />}>
          <ResumenRecepciones filtros={filtros} />
        </Suspense>
      </PanelModulo>

      <section className="card pt-4">
        <FiltrosRecepcionesBarra
          proveedores={proveedores.ok ? proveedores.datos : []}
          familias={o.familias}
          subfamilias={o.subfamilias}
          marcas={o.marcas}
          usuarios={o.usuarios}
        />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaRecepciones filtros={filtros} query={query} />
        </Suspense>
      </section>
    </div>
  );
}
