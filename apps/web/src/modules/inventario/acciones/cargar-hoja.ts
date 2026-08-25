"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { productosParaContar } from "../api/consultas";
import type { FiltrosConteo, ProductoContable } from "../dominio/tipos";

/**
 * Trae los productos que se van a contar.
 *
 * Es una lectura, así que por la convención de módulos viviría solo en `api/`.
 * Esta envoltura existe porque la hoja de conteo la pide desde el navegador
 * al cambiar el filtro, y eso solo se puede hacer con `"use server"`. La
 * consulta de verdad sigue estando en `api/consultas.ts`; aquí solo se añade
 * el control de acceso.
 */

/** Solo gerencia, igual que el ajuste que va a salir de esta hoja. */
const ROLES = ["gerencia", "admin"] as const;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export async function cargarHoja(
  filtros: FiltrosConteo,
): Promise<Resultado<{ filas: ProductoContable[]; truncado: boolean }>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Sesión expirada." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "El cuadre de inventario está restringido a Gerencia." };
  }

  // Los filtros llegan del navegador: se aceptan solo los tres que existen y
  // con la forma que se espera. Un `familia` que no sea un uuid lo rechazaría
  // Postgres, pero con un error que no se le puede enseñar a nadie.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const limpios: FiltrosConteo = {
    familia: filtros.familia && uuid.test(filtros.familia) ? filtros.familia : undefined,
    marca: filtros.marca && uuid.test(filtros.marca) ? filtros.marca : undefined,
    soloConStock: filtros.soloConStock === true,
  };

  return productosParaContar(limpios);
}
