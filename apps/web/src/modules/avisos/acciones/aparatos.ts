"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

import { describirAparato, endpointPermitido, SEVERIDADES, type Severidad } from "../dominio/envio";
import { mandar, pushConfigurado } from "../api/push";

/**
 * Lo que se hace con los aparatos propios desde «Mi perfil» (162).
 *
 * Toda Server Action es un endpoint público: ninguna recibe un id de usuario
 * —sale de la sesión— y todas pasan por RLS, que solo deja ver y tocar los
 * aparatos propios. El alta va por `registrar_suscripcion_push`, que vuelve a
 * comprobar sesión y dirección.
 */

export type ResultadoAparato = { ok: true; mensaje: string } | { ok: false; error: string };

async function sinSesion(): Promise<ResultadoAparato | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  return null;
}

const esquemaSuscripcion = z
  .object({
    endpoint: z.string().url().max(1000),
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(8).max(100),
    agente: z.string().max(500),
  })
  .strict();

/** Da de alta (o refresca) el aparato desde el que se pulsa el botón. */
export async function registrarAparato(datos: {
  endpoint: string;
  p256dh: string;
  auth: string;
  agente: string;
}): Promise<ResultadoAparato> {
  const no = await sinSesion();
  if (no) return no;

  const d = esquemaSuscripcion.safeParse(datos);
  if (!d.success) return { ok: false, error: "El navegador mandó una suscripción que no es válida." };
  if (!endpointPermitido(d.data.endpoint)) {
    return { ok: false, error: "Este navegador usa un servicio de avisos que no conocemos." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("registrar_suscripcion_push", {
      p_endpoint: d.data.endpoint,
      p_p256dh: d.data.p256dh,
      p_auth: d.data.auth,
      p_aparato: describirAparato(d.data.agente),
      p_agente: d.data.agente,
    });
    if (error) return { ok: false, error: mensajeDeError(error) };
    revalidatePath("/perfil");
    return { ok: true, mensaje: "Listo: los avisos te llegarán aquí." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

const esUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Quita uno de MIS aparatos. Si es de otro, RLS no lo deja ver y no se borra nada. */
export async function quitarAparato(id: string): Promise<ResultadoAparato> {
  const no = await sinSesion();
  if (no) return no;
  if (!esUuid(id)) return { ok: false, error: "El aparato no es válido." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.from("suscripciones_push").delete().eq("id", id).select("id");
    if (error) return { ok: false, error: mensajeDeError(error) };
    if (!data || data.length === 0) return { ok: false, error: "Ese aparato ya no estaba en tu lista." };
    revalidatePath("/perfil");
    return { ok: true, mensaje: "Aparato quitado: ya no le llegarán avisos." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/** Qué avisos me llegan. Se cambia en todos mis aparatos a la vez. */
export async function cambiarQueMeLlega(severidad: Severidad): Promise<ResultadoAparato> {
  const no = await sinSesion();
  if (no) return no;
  if (!SEVERIDADES.includes(severidad)) return { ok: false, error: "La opción no es válida." };

  try {
    const supabase = await clienteServidor();
    const perfil = await perfilActual();
    const { error } = await supabase
      .from("suscripciones_push")
      .update({ severidad_minima: severidad })
      .eq("usuario_id", perfil!.id);
    if (error) return { ok: false, error: mensajeDeError(error) };
    revalidatePath("/perfil");
    return { ok: true, mensaje: "Guardado." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Manda un aviso de prueba a ESTE aparato.
 *
 * Se busca por la dirección y con el cliente de la sesión: si la dirección no
 * es de un aparato mío, RLS no la devuelve y no sale nada. Así no se puede
 * usar para mandar avisos al celular de otro.
 */
export async function probarAviso(endpoint: string): Promise<ResultadoAparato> {
  const no = await sinSesion();
  if (no) return no;
  if (typeof endpoint !== "string" || !endpointPermitido(endpoint)) {
    return { ok: false, error: "Este aparato no está activado." };
  }
  if (!pushConfigurado()) {
    return { ok: false, error: "El servidor no tiene configurados los avisos. Avisa a Luis." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("suscripciones_push")
      .select("endpoint, p256dh, auth")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) return { ok: false, error: mensajeDeError(error) };
    if (!data) return { ok: false, error: "Este aparato no está activado. Pulsa «Recibir avisos» primero." };

    const r = await mandar(data, {
      titulo: "Aviso de prueba de Rodatech",
      cuerpo: "Si lees esto, los avisos del sistema te llegan a este aparato.",
      url: "/perfil",
      etiqueta: "rodatech-prueba",
      urgente: false,
    });
    if (!r.ok) {
      return {
        ok: false,
        error: r.definitivo
          ? "Este aparato ya no acepta avisos. Quítalo de la lista y vuelve a activarlo."
          : `No se pudo mandar: ${r.error}`,
      };
    }
    return { ok: true, mensaje: "Enviado. Debería aparecer en unos segundos." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
