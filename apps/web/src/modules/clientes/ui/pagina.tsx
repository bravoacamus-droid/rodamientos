import { Suspense } from "react";
import Link from "next/link";
import { FileDown, FileSpreadsheet, Plus } from "lucide-react";
import { Skeleton, buttonVariants, cn, leerTamano } from "@rodatech/ui";
import { BotonBloqueado } from "@/componentes/sin-permiso";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";

import type { FiltrosClientes } from "../dominio/tipos";
import { filtrosClientesAQuery, leerFiltrosClientes, lectorDe } from "../dominio/filtros";
import { rubrosDeCliente, zonasDeVisita } from "../api/consultas";
import { FiltrosClientesBarra } from "./filtros";
import { ResumenCartera } from "./resumen-cartera";
import { TablaClientes } from "./tabla";
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
 * Cartera de clientes.
 *
 * Server Component: los filtros viven en la URL y la lectura pasa entera en el
 * servidor. Lo único que se hidrata es la barra de filtros y el menú de cada
 * fila.
 */
export default async function PaginaClientes({ searchParams }: Props) {
  const sp = await searchParams;

  // Los filtros se validan en `leerFiltrosClientes`, el mismo que leen el
  // Excel y el PDF: un `?condicion=cualquiercosa` no llega al `where`.
  const soloFiltros = leerFiltrosClientes(lectorDe(sp));
  const filtros: FiltrosClientes = {
    ...soloFiltros,
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  const [permisos, zonas, rubros] = await Promise.all([misPermisos(), zonasDeVisita(), rubrosDeCliente()]);
  // Sin permiso el botón sale con candado y dice por qué (QA, 20/10): que
  // aparezca y rebote al guardar es lo peor; que no aparezca, tampoco explica.
  const puedeCrear = permisos.tiene("clientes", "crear");
  const query = filtrosClientesAQuery(soloFiltros);
  const sufijo = query ? `?${query}` : "";
  const botonSecundario = cn(
    buttonVariants({ variant: "outline" }),
    "h-11 w-full sm:w-auto md:h-control-md hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
  );

  return (
    <div className="flex flex-col gap-5">
      <PanelModulo ruta="/clientes">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Cartera comercial: documento, zona de visita y rubro.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Bajar lo filtrado (Luis, 26/11): todos los clientes que
              coinciden, no solo la página, y siempre con los filtros puestos. */}
          <a href={`/clientes/excel${sufijo}`} className={botonSecundario}>
            <FileSpreadsheet aria-hidden="true" />
            Descargar en Excel
          </a>
          <a href={`/clientes/pdf${sufijo}`} target="_blank" rel="noopener" className={botonSecundario}>
            <FileDown aria-hidden="true" />
            Descargar PDF
          </a>
          {puedeCrear ? (
            <Link
              href="/clientes/nuevo"
              // El de `buttonVariants`, con el relieve del 30/10, como el de
              // cotizaciones y productos (revisión de entrega, 02/11).
              className={cn(buttonVariants({ variant: "primary" }), "h-11 w-full sm:w-auto md:h-control-md")}
            >
              <Plus strokeWidth={2.5} aria-hidden="true" />
              Nuevo cliente
            </Link>
          ) : (
            <BotonBloqueado
              mensaje={avisoSinPermiso("clientes", "crear", permisos.nombreRol)}
              className="w-full sm:w-auto"
            >
              Nuevo cliente
            </BotonBloqueado>
          )}
          </div>
        </div>

        {/* Por zona y por rubro (141), encima de la lista: es la pregunta con
            que se arma la semana de visitas. */}
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <ResumenCartera hoy={new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date())} />
        </Suspense>
      </PanelModulo>

      <section className="card @container pt-4">
        <FiltrosClientesBarra zonas={zonas} rubros={rubros} />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaClientes filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
