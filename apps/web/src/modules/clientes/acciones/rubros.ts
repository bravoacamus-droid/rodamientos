"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";
import { sinPermiso } from "@/lib/permisos";
import type { Accion } from "@/lib/permisos-comun";

/**
 * Los dos catálogos del cliente —rubros (141) y zonas (142)— con su CRUD
 * completo desde el propio desplegable.
 *
 * Willy, 20/10: *«con la opción de que haya algún rubro medio raro que no se
 * conoce y que se pueda crear»*. Luis, el mismo día: *«el CRUD completo
 * dentro de los select: editar si se equivocaron o eliminar si no lo
 * necesitan»*. Las reglas viven en la base (142): normaliza, no deja repetir
 * y no borra lo que usa algún cliente, diciendo cuántos.
 */

type Opcion = { id: string; nombre: string };
type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const nombre = z.string().trim().min(2, "El nombre es demasiado corto.").max(80, "El nombre es demasiado largo.");
const id = z.string().uuid("No es válido.");

async function ejecutar<T>(rpc: string, args: Record<string, unknown>, accion: Accion): Promise<Resultado<T>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  // Crear y corregir desde el formulario del cliente es editar; borrar, eliminar (144).
  const no = await sinPermiso("clientes", accion);
  if (no) return { ok: false, error: no };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc(rpc as never, args as never);
    // El mensaje de la base tal cual, sin el código entre paréntesis: aquí
    // las frases las escribe la 142 para leerlas («La tienen 3 clientes…»).
    if (error) return { ok: false, error: error.message || mensajeDeError(error) };
    revalidatePath("/clientes");
    return { ok: true, datos: data as T };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

function invalido(e: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: e.issues[0]?.message ?? "Dato no válido." };
}

export async function crearRubro(texto: string): Promise<Resultado<Opcion>> {
  const n = nombre.safeParse(texto);
  if (!n.success) return invalido(n.error);
  return ejecutar<Opcion>("crear_rubro", { p_nombre: n.data }, "editar");
}

export async function renombrarRubro(idRubro: string, texto: string): Promise<Resultado<Opcion>> {
  const i = id.safeParse(idRubro);
  const n = nombre.safeParse(texto);
  if (!i.success) return invalido(i.error);
  if (!n.success) return invalido(n.error);
  return ejecutar<Opcion>("renombrar_rubro", { p_id: i.data, p_nombre: n.data }, "editar");
}

export async function eliminarRubro(idRubro: string): Promise<Resultado<null>> {
  const i = id.safeParse(idRubro);
  if (!i.success) return invalido(i.error);
  return ejecutar<null>("eliminar_rubro", { p_id: i.data }, "eliminar");
}

export async function crearZona(texto: string): Promise<Resultado<Opcion>> {
  const n = nombre.safeParse(texto);
  if (!n.success) return invalido(n.error);
  return ejecutar<Opcion>("crear_zona", { p_nombre: n.data }, "editar");
}

export async function renombrarZona(idZona: string, texto: string): Promise<Resultado<Opcion>> {
  const i = id.safeParse(idZona);
  const n = nombre.safeParse(texto);
  if (!i.success) return invalido(i.error);
  if (!n.success) return invalido(n.error);
  return ejecutar<Opcion>("renombrar_zona", { p_id: i.data, p_nombre: n.data }, "editar");
}

export async function eliminarZona(idZona: string): Promise<Resultado<null>> {
  const i = id.safeParse(idZona);
  if (!i.success) return invalido(i.error);
  return ejecutar<null>("eliminar_zona", { p_id: i.data }, "eliminar");
}
