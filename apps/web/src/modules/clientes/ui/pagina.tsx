import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import type { CondicionPago, FiltrosClientes } from "../dominio/tipos";
import { FiltrosClientesBarra } from "./filtros";
import { TablaClientes } from "./tabla";

/** Roles que mantienen la cartera. Ventas entra porque es quien da de alta. */
const ROLES_ESCRITURA = ["gerencia", "admin", "ventas"];

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

  const condicion = uno(sp.condicion);
  const filtros: FiltrosClientes = {
    q: uno(sp.q),
    // Se valida aquí y no en la consulta: un `?condicion=cualquiercosa` escrito
    // a mano en la barra del navegador no debe llegar al `where`.
    condicion:
      condicion === "contado" || condicion === "credito"
        ? (condicion as CondicionPago)
        : undefined,
    bloqueados: uno(sp.bloqueados) === "1",
    inactivos: uno(sp.inactivos) === "1",
    cursor: uno(sp.cursor),
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  const perfil = await perfilActual();
  // Solo quien mantiene la cartera ve el botón. Que aparezca y luego rebote es
  // peor que no verlo.
  const puedeCrear =
    perfil !== null && perfil.activo && ROLES_ESCRITURA.includes(perfil.rol);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Cartera comercial: documento, condición de pago y línea de crédito.
          </p>
        </div>

        {puedeCrear ? (
          <Link
            href="/clientes/nuevo"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 sm:w-auto md:h-control-md"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Nuevo cliente
          </Link>
        ) : null}
      </div>

      <section className="card pt-4">
        <FiltrosClientesBarra />

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
