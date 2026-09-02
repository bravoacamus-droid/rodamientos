"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Enseñarle al sistema qué vende un proveedor.
 *
 * Lo normal es que no haga falta: cada compra lo apunta sola (migración 046).
 * Esto es para lo que TODAVÍA no se le ha comprado — «me pasó su lista de
 * precios de FAG»—, que la base no tiene forma de saber.
 *
 * Toda la regla vive en el RPC `anotar_productos_de_proveedor`: rellena
 * también `proveedor_marcas`, no pisa un costo real con una declaración y
 * decide qué se puede borrar. Aquí solo se valida la entrada y se comprueba el
 * rol, porque una Server Action es un endpoint público.
 */

/** La misma lista que `permisos_rol` tiene para `proveedor_productos`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export type ResultadoCatalogo =
  | { ok: true; anotados: number }
  | { ok: false; error: string };

const uuid = z.string().uuid("Identificador inválido.");

const esquemaAnotar = z.object({
  proveedorId: uuid,
  // 200 de golpe es más de lo que nadie teclea, y evita que una llamada
  // fabricada monte medio maestro en una sola petición.
  productoIds: z.array(uuid).min(1, "No hay nada que anotar.").max(200),
  notas: z.string().trim().max(300).optional(),
});

async function autorizado(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede editar el catálogo de un proveedor.";
  }
  return null;
}

export async function anotarQueVende(entrada: {
  proveedorId: string;
  productoIds: string[];
  notas?: string;
}): Promise<ResultadoCatalogo> {
  const noPuede = await autorizado();
  if (noPuede) return { ok: false, error: noPuede };

  const revisado = esquemaAnotar.safeParse(entrada);
  if (!revisado.success) {
    return {
      ok: false,
      error: revisado.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }
  const datos = revisado.data;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("anotar_productos_de_proveedor", {
      p_proveedor: datos.proveedorId,
      p_items: datos.productoIds.map((id) => ({ producto_id: id })),
      // `undefined` y no `null`: los tipos generados declaran estos
      // parámetros como opcionales, y PostgREST los omite del cuerpo, que
      // es lo que hace que Postgres use el DEFAULT de la función.
      p_fecha: undefined,
      p_moneda: "USD",
      p_tipo_cambio: undefined,
      // `false` es lo que distingue esta puerta de la de las compras: NO suma
      // una compra que no ha ocurrido, y no pisa un costo real con nada.
      p_comprado: false,
      p_notas: datos.notas && datos.notas.length > 0 ? datos.notas : undefined,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/proveedores/${datos.proveedorId}`);
    return { ok: true, anotados: Number(data ?? 0) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo anotar.",
    };
  }
}

export async function olvidarQueVende(
  proveedorId: string,
  productoId: string,
): Promise<ResultadoCatalogo> {
  const noPuede = await autorizado();
  if (noPuede) return { ok: false, error: noPuede };

  const revisado = z.object({ p: uuid, q: uuid }).safeParse({
    p: proveedorId,
    q: productoId,
  });
  if (!revisado.success) return { ok: false, error: "Identificador inválido." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("olvidar_producto_de_proveedor", {
      p_proveedor: proveedorId,
      p_producto: productoId,
    });

    // El RPC se niega a borrar lo que sí se compró. Su mensaje ya explica por
    // qué —lleva el número de compras dentro— así que se enseña tal cual en
    // vez de sustituirlo por uno genérico.
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/proveedores/${proveedorId}`);
    return { ok: true, anotados: 0 };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo quitar.",
    };
  }
}

export interface ProductoParaAnotar {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string | null;
}

/**
 * Búsqueda de catálogo para el cuadro de «Qué vende».
 *
 * Es una lectura y por la convención de módulos viviría en `api/`. Está aquí
 * porque la llama el navegador según se teclea, y eso solo se puede hacer con
 * `"use server"`. Mismo motivo que en compras y en recepciones.
 */
export async function buscarParaAnotar(
  termino: string,
): Promise<{ ok: true; datos: ProductoParaAnotar[] } | { ok: false; error: string }> {
  const noPuede = await autorizado();
  if (noPuede) return { ok: false, error: noPuede };

  const q = termino.trim();
  if (q.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_productos", {
      p_q: q,
      p_limit: 20,
      // Lo que se anota es lo que el proveedor VENDE, no lo que tenemos:
      // filtrar por stock escondería justo lo que hay que reponer.
      p_solo_con_stock: false,
    });
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      datos: (data ?? []).map((p: Record<string, unknown>) => ({
        id: String(p.id),
        codigo: String(p.codigo ?? ""),
        descripcion: String(p.descripcion ?? ""),
        marca: (p.marca as string | null) ?? null,
        unidad: (p.unidad ?? p.unidad_codigo ?? null) as string | null,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el catálogo.",
    };
  }
}
