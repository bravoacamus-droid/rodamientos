import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresParaPedir, proveedoresPorProducto } from "@/modules/proveedores";

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

  if (items.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada que preguntar"
        descripcion="Marca en la bandeja lo que te falta y vuelve; la lista llega sola."
        accion={
          <Link
            href="/compras/por-comprar"
            className="inline-flex h-9 items-center rounded-sm bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ir a «Por comprar»
          </Link>
        }
      />
    );
  }

  /*
    Dos consultas, no cuatro (09/09).

    Se traían además las plantillas de mensaje, la razón social de la empresa y
    la fecha, y todo eso era solo para RELLENAR el texto del WhatsApp que se
    ofrecía escribir aquí. Ese bloque se fue, así que la pantalla vuelve a
    pedir lo único que usa: quién vende esto y quién vende cada cosa.
  */
  const [proveedores, porProducto] = await Promise.all([
    proveedoresParaPedir(items.map((i) => i.producto.id)),
    // Quién vende CADA uno. Es lo que permite mandarle a cada proveedor solo
    // lo suyo cuando los productos no comparten proveedor, que en este
    // catálogo es lo normal.
    proveedoresPorProducto(items.map((i) => i.producto.id)),
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
