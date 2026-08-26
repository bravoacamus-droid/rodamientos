"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

/**
 * Crear familias, sub-familias y descripciones sin salir del alta de producto.
 *
 * Willy, 26/08 (10:40): *«digamos que nos pide unos pernos que no están en
 * rodamientos. Habría que crear. En cada clasificación tendría que haber la
 * opción de crear una nueva familia o sub-familia»*.
 *
 * El trabajo de verdad lo hace la base (migración 028), y no por gusto: las
 * tres tablas tienen un `codigo` único en TODA la tabla, así que hay que
 * inventarlo, comprobar que esté libre e insertar sin que otra sesión gane la
 * carrera. Eso es una transacción.
 *
 * Crear algo que ya existe NO es un error: se devuelve lo que hay. Quien está
 * dando de alta un producto no quiere una lección sobre duplicados, quiere
 * seguir — y acaba en la familia que esperaba de todos modos.
 */

/** La misma lista que mantiene el maestro de productos. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export interface NodoCreado {
  id: string;
  nombre: string;
  codigo: string;
  /** `false` si ya existía y se devolvió el que había. */
  creada: boolean;
}

export type ResultadoCatalogo =
  | { ok: true; datos: NodoCreado }
  | { ok: false; error: string };

const nombre = z
  .string()
  .trim()
  .min(2, "El nombre es demasiado corto")
  .max(120, "El nombre es demasiado largo");

const uuid = z.string().uuid();

async function exigirPermiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede tocar la clasificación de productos. La mantienen Compras o Gerencia.";
  }
  return null;
}

/** Traduce el JSON del RPC, que es el mismo en las tres. */
function aNodo(data: unknown): NodoCreado {
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id),
    nombre: String(o.nombre),
    codigo: String(o.codigo),
    creada: Boolean(o.creada),
  };
}

/** Revalida las pantallas donde se elige la clasificación. */
function revalidar() {
  revalidatePath("/productos", "layout");
  revalidatePath("/configuracion");
}

export async function crearFamilia(texto: string): Promise<ResultadoCatalogo> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const valido = nombre.safeParse(texto);
  if (!valido.success) {
    return { ok: false, error: valido.error.issues[0]?.message ?? "Nombre no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_familia", {
      p_nombre: valido.data,
    });
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidar();
    return { ok: true, datos: aNodo(data) };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export async function crearSubfamilia(
  familiaId: string,
  texto: string,
): Promise<ResultadoCatalogo> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  if (!uuid.safeParse(familiaId).success) {
    return { ok: false, error: "Elige primero la familia." };
  }
  const valido = nombre.safeParse(texto);
  if (!valido.success) {
    return { ok: false, error: valido.error.issues[0]?.message ?? "Nombre no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_subfamilia", {
      p_familia: familiaId,
      p_nombre: valido.data,
    });
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidar();
    return { ok: true, datos: aNodo(data) };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * La «descripción» del catálogo del cliente, que en el esquema es un `tipo`.
 *
 * No pide la familia: la deduce de la sub-familia. La clave ajena de `tipos`
 * es compuesta —(subfamilia_id, familia_id)— justamente para que no se pueda
 * colgar de una sub-familia de otra familia, y pedirla por separado sería
 * abrir la puerta a que llegue equivocada.
 */
export async function crearTipo(
  subfamiliaId: string,
  texto: string,
): Promise<ResultadoCatalogo> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  if (!uuid.safeParse(subfamiliaId).success) {
    return { ok: false, error: "Elige primero la sub-familia." };
  }
  const valido = nombre.safeParse(texto);
  if (!valido.success) {
    return { ok: false, error: valido.error.issues[0]?.message ?? "Nombre no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_tipo", {
      p_subfamilia: subfamiliaId,
      p_nombre: valido.data,
    });
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidar();
    return { ok: true, datos: aNodo(data) };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
