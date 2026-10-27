"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Marcar un fallo como revisado.
 *
 * No se borra: se marca. El histórico de qué se rompió y cuándo es justo lo
 * que hace falta el día que algo vuelve a romperse igual — y al dejar de estar
 * pendiente, su huella queda libre, así que si reaparece abre una fila nueva y
 * se nota que volvió.
 */

export type ResultadoFallo = { ok: true } | { ok: false; error: string };

export async function marcarRevisado(id: number): Promise<ResultadoFallo> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const prohibido = await sinPermiso("bitacora", "editar");
  if (prohibido) {
    return { ok: false, error: prohibido };
  }
  if (!z.number().int().positive().safeParse(id).success) {
    return { ok: false, error: "Identificador inválido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("fallos").update({ revisado: true }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/actividad");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo marcar.",
    };
  }
}

/**
 * Marcar como revisados todos los que quedan (TR-11, 27/10).
 *
 * Había 73 sin revisar, casi todos del entorno de desarrollo («Loading chunk»,
 * «is not defined»). Uno a uno no los marca nadie, y el día que falle algo de
 * verdad quedaría debajo de ellos. Mismo permiso que marcar uno.
 *
 * Recibe los ids que la pantalla está enseñando y marca esos, no «todos los
 * pendientes»: la lista trae como mucho 50 y el aviso dice cuántos. Marcar
 * 73 tras confirmar 50 se llevaba también lo que nadie había visto.
 */
const IDS = z.array(z.number().int().positive()).min(1).max(200);

export async function marcarTodosRevisados(ids: number[]): Promise<ResultadoFallo> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const prohibido = await sinPermiso("bitacora", "editar");
  if (prohibido) return { ok: false, error: prohibido };
  const leidos = IDS.safeParse(ids);
  if (!leidos.success) return { ok: false, error: "No hay fallos que marcar." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("fallos")
      .update({ revisado: true })
      .in("id", leidos.data)
      .eq("revisado", false);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/actividad");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudieron marcar.",
    };
  }
}
