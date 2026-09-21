"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { proveedoresPorProducto } from "@/modules/proveedores/api/catalogo";
import type { ProveedorParaPedir } from "@/modules/proveedores/dominio/pedir";

/**
 * Quién vende estos productos, pedido AL VUELO.
 *
 * Existe porque desde el 21/09 la ronda de precios se puede armar desde cero:
 * al añadir un producto a mano hay que saber quién lo vende, y eso el servidor
 * solo lo sabía al abrir la pantalla — cuando la lista venía entera desde la
 * bandeja «Por comprar».
 *
 * Luis, 21/09: *«en compras hay que hacer también que puedan registrar compras
 * sin cotizaciones, directo»* — *«desde 0, registrar qué productos va a cotizar
 * con los proveedores»*.
 *
 * La lectura vive en `proveedores/api`, que es `server-only`; esto es solo la
 * envoltura que le permite al navegador pedirla, igual que `cargar.ts` en
 * facturación.
 */

/** La misma lista que `permisos_rol` tiene para `compras`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export async function quienVende(
  productoIds: string[],
): Promise<Record<string, ProveedorParaPedir[]>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return {};
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) return {};

  // Los argumentos llegan del navegador. El tope no es paranoia: esto se
  // llama al añadir productos de uno en uno, y una lista larga aquí sería
  // siempre un error de quien llama.
  if (!Array.isArray(productoIds) || productoIds.length === 0) return {};
  const ids = productoIds.filter((x) => typeof x === "string").slice(0, 50);
  if (ids.length === 0) return {};

  const r = await proveedoresPorProducto(ids);
  /*
    Un fallo NO puede impedir añadir el producto.

    Saber quién lo vende es un atajo —marca solo a los que ya le compraron
    eso— y la pantalla funciona sin él: se eligen los proveedores a mano, que
    es lo que había que hacer antes de la 046. Devolver vacío degrada; lanzar
    dejaría la ronda a medio armar.
  */
  return r.ok ? r.datos : {};
}
