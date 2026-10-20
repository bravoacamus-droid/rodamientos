import { Suspense } from "react";
import Link from "next/link";
import { Skeleton, leerTamano } from "@rodatech/ui";
import { misPermisos } from "@/lib/permisos";
import { avisoSinPermiso } from "@/lib/permisos-comun";
import { BotonBloqueado } from "@/componentes/sin-permiso";

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
    direccion: uno(sp.dir) === "ant" ? "ant" : "sig",
    limite: leerTamano(uno(sp.n)),
  };

  const [proveedores, permisos] = await Promise.all([
    proveedoresActivos(),
    misPermisos(),
  ]);

  // Lo que dice Configuración › Roles y permisos (143). Sin permiso el botón sale
  // con candado y explica, en vez de esconderse (QA, 20/10).
  const puedeComprar = permisos.tiene("compras", "crear");

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
        ) : !puedeComprar ? (
          <BotonBloqueado mensaje={avisoSinPermiso("compras", "crear", permisos.nombreRol)} className="h-9 md:h-9">
            Registrar compra
          </BotonBloqueado>
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
