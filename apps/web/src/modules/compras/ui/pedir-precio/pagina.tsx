import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoError, EstadoVacio } from "@rodatech/ui";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { plantillasParaMandar } from "@/modules/mensajes";
import { proveedoresParaPedir } from "@/modules/proveedores";

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

  const supabase = await clienteServidor();
  const [proveedores, plantillas, { data: emp }] = await Promise.all([
    proveedoresParaPedir(items.map((i) => i.producto.id)),
    plantillasParaMandar("pedido_precio"),
    supabase.from("empresa").select("razon_social").eq("id", 1).maybeSingle(),
  ]);

  const hoy = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima" }).format(
    new Date(),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedir precio</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            El mismo mensaje a varios proveedores, con la lista ya escrita.
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
        plantillas={plantillas.ok ? plantillas.datos : []}
        empresa={emp?.razon_social ?? "Rodatech"}
        yo={perfil.nombre ?? ""}
        hoy={hoy}
      />
    </div>
  );
}
