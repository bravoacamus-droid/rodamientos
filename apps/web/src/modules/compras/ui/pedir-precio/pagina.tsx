import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresParaPedir, proveedoresPorProducto } from "@/modules/proveedores";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import { precargaDeCompra } from "../../api/por-comprar";
import { PedirPrecio } from "./pantalla";

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"];

/**
 * Pedirle precio a varios proveedores a la vez.
 *
 * Es el paso 5 del plan de compras: *«manda a sus proveedores a ver cuál es
 * más barato»*. Se llega desde la bandeja «Por comprar» con lo que falta ya
 * marcado —`?items=<producto>:<cantidad>`, el mismo formato con el que se
 * llega al registro de compra— así que no hay que volver a elegir nada.
 *
 * Lo que ahorra no es mandar: es no teclear quince códigos cuatro veces, y
 * que a los cuatro les llegue exactamente la misma lista.
 */
export default async function PaginaPedirPrecio({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  if (!ROLES.includes(perfil.rol)) {
    return (
      <EstadoError
        titulo="No puedes pedir precios"
        descripcion="Tu rol no tiene permiso para el abastecimiento."
      />
    );
  }

  const sp = searchParams ? await searchParams : {};
  const crudo = Array.isArray(sp.items) ? sp.items[0] : sp.items;
  const items = await precargaDeCompra(crudo);

  /*
    Llegar SIN lista ya no es un callejón: es el caso normal.

    Hasta el 21/09 esta pantalla solo abría con `?items=`, o sea solo viniendo
    de la bandeja «Por comprar» — que se llena de cotizaciones aprobadas sin
    stock. El efecto era que **sin cotización no había ronda de precios**, y
    ese es justo el trabajo que Willy hace todos los días por su cuenta.

    Luis, 21/09: *«su otro proceso es preguntar a sus proveedores los precios,
    nomás por WhatsApp o llamada… y él va apuntando en un Excel»*. Y lo que
    pidió son dos entradas: *«desde 0, registrar qué productos va a cotizar con
    los proveedores»* o *«ya cotizó, ya tiene los precios»*.

    No son dos pantallas: es esta, con los precios tecleados antes o después.
    Así que si no llega lista, se abre vacía y se arma aquí.
  */
  const ids = items.map((i) => i.producto.id);

  const [proveedores, porProducto] =
    ids.length === 0
      ? [
          { ok: true as const, datos: [] as ProveedorParaPedir[] },
          { ok: true as const, datos: {} as Record<string, ProveedorParaPedir[]> },
        ]
      : await Promise.all([
          proveedoresParaPedir(ids),
          // Quién vende CADA uno. Es lo que permite mandarle a cada proveedor
          // solo lo suyo cuando los productos no comparten proveedor, que en
          // este catálogo es lo normal.
          proveedoresPorProducto(ids),
        ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedir precio</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Apunta a quién le vas a preguntar. El mensaje lo mandas tú por donde quieras.
          </p>
        </div>
        <Link
          href="/compras/por-comprar"
          className="inline-flex h-9 items-center rounded-sm border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Volver a la bandeja
        </Link>
      </div>

      <PedirPrecio
        items={items.map((i) => ({
          producto_id: i.producto.id,
          codigo: i.producto.codigo,
          descripcion: i.producto.descripcion,
          marca: i.producto.marca,
          unidad: i.producto.unidad ?? "NIU",
          cantidad: i.cantidad,
        }))}
        proveedores={proveedores.ok ? proveedores.datos : []}
        porProducto={porProducto.ok ? porProducto.datos : {}}
      />
    </div>
  );
}
