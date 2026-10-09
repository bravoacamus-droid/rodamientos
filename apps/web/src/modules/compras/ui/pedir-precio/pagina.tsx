import { Volver } from "@/componentes/volver";
import { redirect } from "next/navigation";
import { EstadoError } from "@rodatech/ui";
import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresParaPedir, proveedoresPorProducto } from "@/modules/proveedores";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

import { precargaDeCompra } from "../../api/por-comprar";
import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";

import { productosRecientes, referenciasDeProductos } from "../../api/hoja-precios";
import { hojaVacia } from "../../dominio/hoja-precios";
import { HojaPrecios } from "../hoja-precios/hoja";

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

  const [refs, recientes] = await Promise.all([referenciasDeProductos(ids), productosRecientes(6)]);

  const [proveedores] =
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
      {/*
        El «Volver» de todas las fichas, encima del título, y a donde se vino:
        decía siempre «Volver a la bandeja», también llegando sin lista desde
        «Pedir precios», que es el caso normal desde el 21/09 (revisión por
        módulos del 02/10).
      */}
      <div className="flex flex-col gap-1">
        {items.length > 0 ? (
          <Volver href="/compras/por-comprar">Volver a por comprar</Volver>
        ) : (
          <Volver href="/compras/precios">Volver a pedir precios</Volver>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">Pedir precios</h1>
        <p className="text-base text-[var(--fg-muted)]">
          Los productos en filas y los proveedores en columnas: apunta lo que te diga cada uno. Aquí no se compra nada
          hasta que pulses «Pasar a compras».
        </p>
      </div>

      <HojaPrecios
        inicial={{
          ...hojaVacia(),
          productos: items.map((i) => ({
            productoId: i.producto.id,
            codigo: i.producto.codigo,
            descripcion: i.producto.descripcion,
            marca: i.producto.marca,
            unidad: unidadLegible(i.producto.unidad ?? "NIU"),
            cantidad: Math.max(1, Math.round(i.cantidad)),
            precioVenta: refs.get(i.producto.id)?.precioVenta ?? null,
            ultimoCosto: refs.get(i.producto.id)?.ultimoCosto ?? null,
            ultimaCompra: refs.get(i.producto.id)?.ultimaCompra ?? null,
            ultimaVenta: refs.get(i.producto.id)?.ultimaVenta ?? null,
          })),
        }}
        recientes={recientes}
        sugeridos={(proveedores.ok ? proveedores.datos : [])
          .filter((p) => p.coincidencias > 0)
          .map((p) => ({ proveedorId: p.id, nombre: p.razon_social, coincidencias: p.coincidencias }))}
      />
    </div>
  );
}
