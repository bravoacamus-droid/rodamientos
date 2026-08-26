"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

/**
 * Las tres cosas que se le hacen a una alerta: leerla, archivarla y pedir que
 * se vuelvan a calcular.
 *
 * No hay RPC para leer ni para archivar porque no hace falta: son un UPDATE de
 * una columna booleana y RLS ya decide quién puede. La política pregunta a
 * `permisos_rol`, donde `alertas` está abierta a los cinco roles — es un tablero
 * compartido, no el buzón de nadie en particular.
 *
 * Archivar SÍ tiene consecuencia, y conviene tenerla presente: el índice único
 * `ux_alertas_huella` solo cubre las NO archivadas, así que archivar una alerta
 * la vuelve a hacer elegible. Si la causa sigue ahí, la próxima corrida la crea
 * otra vez. Es deliberado: archivar significa «ya me ocupé», no «no me lo
 * vuelvas a decir nunca».
 */

export type ResultadoAccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/**
 * Devuelve el fallo si no hay sesión, y `null` si la hay.
 *
 * Solo comprueba que el perfil esté activo: quién puede escribir en `alertas`
 * lo decide RLS contra `permisos_rol`, y repetir aquí la lista de roles sería
 * mantener la misma regla en dos sitios.
 */
async function sesionInvalida(): Promise<ResultadoAccion | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false, error: "Hay que iniciar sesión." };
  }
  return null;
}

function esUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/** Marca una alerta como leída o la devuelve a no leída. */
export async function marcarLeida(
  id: string,
  leida: boolean,
): Promise<ResultadoAccion> {
  const no = await sesionInvalida();
  if (no) return no;
  if (!esUuid(id)) return { ok: false, error: "La alerta no es válida." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("alertas").update({ leida }).eq("id", id);
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidatePath("/alertas");
    return { ok: true, mensaje: leida ? "Marcada como leída." : "Marcada como nueva." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Archiva una alerta: sale de la bandeja viva y pasa al histórico.
 *
 * No se borra. Una alerta borrada es una decisión que nadie puede revisar
 * después, y la pregunta «¿esto ya lo habíamos visto?» se hace bastante.
 */
export async function archivar(id: string): Promise<ResultadoAccion> {
  const no = await sesionInvalida();
  if (no) return no;
  if (!esUuid(id)) return { ok: false, error: "La alerta no es válida." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("alertas")
      .update({ archivada: true, leida: true })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeDeError(error) };

    revalidatePath("/alertas");
    return { ok: true, mensaje: "Archivada." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Marca como leído todo lo que hay en la bandeja viva.
 *
 * `.eq("leida", false)` no es una optimización: sin él, el UPDATE toca cada
 * fila de la tabla y dispara la política de RLS por cada una para no cambiar
 * nada.
 */
export async function marcarTodasLeidas(): Promise<ResultadoAccion> {
  const no = await sesionInvalida();
  if (no) return no;

  try {
    const supabase = await clienteServidor();
    const { error, count } = await supabase
      .from("alertas")
      .update({ leida: true }, { count: "exact" })
      .eq("archivada", false)
      .eq("leida", false);

    if (error) return { ok: false, error: mensajeDeError(error) };

    const n = count ?? 0;
    return revalidarY(
      n === 0
        ? "No quedaba ninguna sin leer."
        : `${n} ${n === 1 ? "alerta marcada" : "alertas marcadas"} como leídas.`,
    );
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Vuelve a calcular las alertas.
 *
 * Llama a `refrescar_alertas()`, no a `generar_alertas()`: la segunda está
 * cerrada a `authenticated` desde la migración 012 porque es trabajo
 * programado. La envoltura valida el rol y es la puerta legítima (migración
 * 021).
 *
 * Mientras no haya un cron cada hora, este botón ES el mecanismo. Cuando lo
 * haya, pasa a ser el «no me fío, mira otra vez».
 */
export async function refrescar(): Promise<ResultadoAccion> {
  const no = await sesionInvalida();
  if (no) return no;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("refrescar_alertas");
    if (error) return { ok: false, error: mensajeDeError(error) };

    const nuevas = Number((data as { nuevas?: unknown } | null)?.nuevas ?? 0);
    return revalidarY(
      nuevas === 0
        ? "Nada nuevo: la bandeja ya estaba al día."
        : `${nuevas} ${nuevas === 1 ? "alerta nueva" : "alertas nuevas"}.`,
    );
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/** Revalida la bandeja y el tablero, que también enseña el contador. */
function revalidarY(mensaje: string): ResultadoAccion {
  revalidatePath("/alertas");
  revalidatePath("/dashboard");
  return { ok: true, mensaje };
}
