import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { marcasDisponibles } from "../api/consultas";
import type { FiltrosProveedores } from "../dominio/tipos";
import { FiltrosProveedoresBarra } from "./filtros";
import { TablaProveedores } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Maestro de proveedores.
 *
 * De quién viene la mercadería. Es el otro extremo del ciclo que abre
 * recepciones, y lo que hace que una recepción tenga a quién colgarse.
 */
export default async function PaginaProveedores({ searchParams }: Props) {
  const sp = await searchParams;

  const tipo = uno(sp.tipo);
  const filtros: FiltrosProveedores = {
    q: uno(sp.q),
    tipo: tipo === "local" || tipo === "importacion" ? tipo : undefined,
    marca: uno(sp.marca),
    inactivos: uno(sp.inactivos) === "1",
    cursor: uno(sp.cursor),
  };

  const [marcas, perfil] = await Promise.all([marcasDisponibles(), perfilActual()]);

  // Que el botón aparezca y luego rebote es peor que no verlo.
  const puedeCrear =
    perfil !== null &&
    perfil.activo &&
    ["gerencia", "admin", "compras"].includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            De quién viene la mercadería, qué marcas trae y cuánto tarda.
          </p>
        </div>

        {puedeCrear ? (
          <Link
            href="/proveedores/nuevo"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Nuevo proveedor
          </Link>
        ) : null}
      </div>

      <section className="card pt-4">
        <FiltrosProveedoresBarra marcas={marcas.ok ? marcas.datos : []} />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaProveedores filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
