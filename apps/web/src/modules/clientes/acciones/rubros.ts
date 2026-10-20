"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

/**
 * Da de alta un rubro desde el formulario del cliente (141).
 *
 * Willy, 20/10: *«con la opción de que haya algún rubro medio raro que no se
 * conoce y que se pueda crear»*. La base normaliza y, si ya existía —«Textil»
 * contra «TEXTIL»—, devuelve el que había en vez de fallar.
 */
export async function crearRubro(
  texto: string,
): Promise<{ ok: true; datos: { id: string; nombre: string } } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };

  const nombre = z.string().trim().min(2, "El rubro es demasiado corto.").max(80, "El rubro es demasiado largo.").safeParse(texto);
  if (!nombre.success) return { ok: false, error: nombre.error.issues[0]?.message ?? "Nombre no válido." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_rubro", { p_nombre: nombre.data });
    if (error) return { ok: false, error: mensajeDeError(error) };
    const r = data as { id: string; nombre: string };
    revalidatePath("/clientes");
    return { ok: true, datos: { id: r.id, nombre: r.nombre } };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
