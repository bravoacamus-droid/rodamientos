import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresActivos } from "../api/consultas";
import type { FiltrosCompras } from "../dominio/tipos";
import { FiltrosComprasBarra } from "./filtros";
import { TablaCompras } from "./tabla";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Toma el primer valor de un search param, que puede venir repetido. */
function uno(v: string | string[] | undefined): string | undefined {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.length > 0 ? valor : undefined;
}

/**
 * Compras.
 *
 * El compromiso con el proveedor. NO mueve stock: eso pasa al recepcionar
 * (Willy, 25:21). Aquí se registra lo que se pidió, a qué precio, y se
 * persigue lo que falta por llegar.
 *
 * Willy no usa orden de compra formal (30:01): pide por WhatsApp o por correo.
 * Por eso esto es un registro de la compra hecha, no una orden que alguien
 * tenga que aprobar antes.
 */
export default async function PaginaCompras({ searchParams }: Props) {
  const sp = await searchParams;

  const filtros: FiltrosCompras = {
    q: uno(sp.q),
    proveedor: uno(sp.proveedor),
    estado: uno(sp.estado),
    tipo: uno(sp.tipo),
    desde: uno(sp.desde),
    hasta: uno(sp.hasta),
    cursor: uno(sp.cursor),
  };

  const [proveedores, perfil] = await Promise.all([
    proveedoresActivos(),
    perfilActual(),
  ]);

  // Que el botón aparezca y luego rebote es peor que no verlo. La lista es la
  // misma que `permisos_rol` tiene para `compras`.
  const puedeComprar =
    perfil !== null &&
    perfil.activo &&
    ["gerencia", "admin", "compras"].includes(perfil.rol);

  const sinProveedores = proveedores.ok && proveedores.datos.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que se le pide al proveedor. El stock se mueve al recibirlo, no aquí.
          </p>
        </div>

        {puedeComprar && !sinProveedores ? (
          <Link
            href="/compras/nueva"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Registrar compra
          </Link>
        ) : null}
      </div>

      {/* Sin proveedores no se puede comprar, y el botón llevaría a un
          formulario con el desplegable vacío. Mejor decir por qué y dónde se
          arregla. */}
      {sinProveedores ? (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm">
          Todavía no hay proveedores dados de alta, y una compra necesita saber a
          quién se le pide.{" "}
          <Link href="/proveedores/nuevo" className="font-medium underline">
            Da de alta el primero
          </Link>
          .
        </p>
      ) : null}

      <section className="card pt-4">
        <FiltrosComprasBarra
          proveedores={proveedores.ok ? proveedores.datos : []}
        />

        <Suspense
          // La clave fuerza un skeleton nuevo en cada cambio de filtro; sin
          // ella React reutiliza el árbol y la tabla se queda con los datos
          // viejos hasta que llega la consulta.
          key={JSON.stringify(filtros)}
          fallback={<Skeleton className="h-96 w-full" />}
        >
          <TablaCompras filtros={filtros} />
        </Suspense>
      </section>
    </div>
  );
}
