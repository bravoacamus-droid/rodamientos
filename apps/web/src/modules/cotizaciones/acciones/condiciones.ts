"use server";

import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { type Accion, sinPermiso } from "@/lib/permisos";

/**
 * La lista de condiciones de la cotización (113). Luis, 12/10: *«un select
 * inteligente que va a guardar cosas ahí, añadir o eliminar […] editar»*.
 *
 * Toda Server Action es un endpoint público: rol y datos aquí, y la base lo
 * vuelve a mirar con RLS (`puede_escribir('cotizaciones')`).
 */
export interface Condicion {
  id: string;
  texto: string;
}

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const texto = z
  .string()
  .transform((t) => t.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2, "Escribe la condición.").max(200, "Máximo 200 letras."));
const id = z.string().uuid();

async function permiso(accion: Accion): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const negado = await sinPermiso("cotizaciones", accion);
  if (negado) return negado;
  return null;
}

const repetida = (mensaje: string) =>
  /duplicate|unique/i.test(mensaje) ? "Esa condición ya está en la lista." : mensaje;

export async function listarCondiciones(): Promise<Resultado<Condicion[]>> {
  const p = await permiso("ver");
  if (p) return { ok: false, error: p };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("condiciones_cotizacion")
    .select("id, texto")
    .order("orden")
    .order("texto");
  if (error) return { ok: false, error: error.message };
  return { ok: true, datos: data ?? [] };
}

export async function crearCondicion(entrada: string): Promise<Resultado<Condicion>> {
  const p = await permiso("editar");
  if (p) return { ok: false, error: p };
  const t = texto.safeParse(entrada);
  if (!t.success) return { ok: false, error: t.error.issues[0]?.message ?? "No es válida." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("condiciones_cotizacion")
    .insert({ texto: t.data, orden: 100 })
    .select("id, texto")
    .single();
  if (error) return { ok: false, error: repetida(error.message) };
  return { ok: true, datos: data };
}

export async function editarCondicion(idCondicion: string, entrada: string): Promise<Resultado<Condicion>> {
  const p = await permiso("editar");
  if (p) return { ok: false, error: p };
  const i = id.safeParse(idCondicion);
  const t = texto.safeParse(entrada);
  if (!i.success) return { ok: false, error: "La condición no es válida." };
  if (!t.success) return { ok: false, error: t.error.issues[0]?.message ?? "No es válida." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("condiciones_cotizacion")
    .update({ texto: t.data })
    .eq("id", i.data)
    .select("id, texto")
    .single();
  if (error) return { ok: false, error: repetida(error.message) };
  return { ok: true, datos: data };
}

export async function eliminarCondicion(idCondicion: string): Promise<Resultado<null>> {
  const p = await permiso("eliminar");
  if (p) return { ok: false, error: p };
  const i = id.safeParse(idCondicion);
  if (!i.success) return { ok: false, error: "La condición no es válida." };
  const supabase = await clienteServidor();
  // Las cotizaciones que ya la usan guardan el texto: borrarla de la lista no
  // les cambia nada.
  const { error } = await supabase.from("condiciones_cotizacion").delete().eq("id", i.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true, datos: null };
}
