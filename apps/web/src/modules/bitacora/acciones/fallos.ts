"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Marcar un fallo como revisado.
 *
 * No se borra: se marca. El histórico de qué se rompió y cuándo es justo lo
 * que hace falta el día que algo vuelve a romperse igual — y al dejar de estar
 * pendiente, su huella queda libre, así que si reaparece abre una fila nueva y
 * se nota que volvió.
 */
const ROLES = ["gerencia", "admin"] as const;

export type ResultadoFallo = { ok: true } | { ok: false; error: string };

export async function marcarRevisado(id: number): Promise<ResultadoFallo> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede marcar fallos." };
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
