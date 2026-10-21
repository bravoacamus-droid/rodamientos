"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import { ErrorGre, MENSAJE_SIN_CONEXION, esErrorDeRed, type ResultadoCdr } from "@rodatech/sunat";

import { bloqueoPorSeriePrueba, conectorSunat, modoGuias } from "@/modules/facturacion/api/configuracion";

import { detalleGuia } from "../api/consultas";
import { faltaParaSunat, guiaParaSunat } from "../dominio/sunat";

/**
 * Mandar una guía a SUNAT (15/10).
 *
 * Desde el 01/07/2026 la GRE es obligatoria, y la guía tiene que estar en
 * SUNAT ANTES de que salga la mercadería: si paran el camión, una guía que
 * SUNAT no tiene es como no llevar guía. Hasta hoy el ERP la emitía, movía el
 * stock e imprimía, y no la mandaba.
 *
 * Va por la API REST de la GRE (`emitirGuia` del conector): se manda, SUNAT
 * da un ticket, y la respuesta se pregunta. Casi siempre tarda segundos, así
 * que se pregunta aquí mismo un par de veces antes de devolver; si no ha
 * contestado, queda «enviada» y se pregunta luego con su botón.
 */

export type ResultadoSunatGuia =
  | { ok: true; estado: "aceptada" | "rechazada" | "en_proceso"; mensaje: string }
  | { ok: false; error: string };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hoyLima = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

async function puede(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const negado = await sinPermiso("guias", "editar");
  if (negado) return negado;
  return null;
}

/** Guarda lo que contestó SUNAT y lo traduce para la pantalla. */
async function guardarRespuesta(id: string, numero: string, r: ResultadoCdr): Promise<ResultadoSunatGuia> {
  await clienteAdmin()
    .from("guias_remision")
    .update({
      estado_sunat: r.aceptado ? (r.observaciones.length > 0 ? "observado" : "aceptado") : "rechazado",
      sunat_codigo_respuesta: r.codigo ?? null,
      sunat_mensaje: r.descripcion ?? null,
    })
    .eq("id", id);
  revalidatePath(`/guias/${id}`);
  revalidatePath("/guias");
  revalidatePath("/sunat");
  return r.aceptado
    ? { ok: true, estado: "aceptada", mensaje: `SUNAT aceptó la guía ${numero}. Ya puede salir la mercadería.` }
    : { ok: true, estado: "rechazada", mensaje: `SUNAT rechazó la guía ${numero}: ${r.descripcion}` };
}

export async function enviarGuiaASunat(id: string): Promise<ResultadoSunatGuia> {
  const negado = await puede();
  if (negado) return { ok: false, error: negado };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa guía no vale." };

  const ficha = await detalleGuia(id);
  if (!ficha.ok) return { ok: false, error: ficha.error };
  const g = ficha.datos;
  if (!g) return { ok: false, error: "La guía no existe." };
  if (g.estado_sunat === "aceptado" || g.estado_sunat === "observado") {
    return { ok: false, error: `${g.numero} ya fue aceptada por SUNAT.` };
  }
  const falta = faltaParaSunat(g);
  if (falta.length > 0) return { ok: false, error: `Antes de mandarla: ${falta.join(" ")}` };

  // SUNAT no tiene pruebas para guías: en beta solo a un emulador (126/127).
  const modo = await modoGuias();
  if (modo.modo === "bloqueado") return { ok: false, error: modo.motivo };
  // Y en producción, nunca una serie de prueba (T001).
  if (modo.modo === "produccion") {
    const prueba = await bloqueoPorSeriePrueba(g.serie);
    if (prueba) return { ok: false, error: prueba };
  }

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };

  const supabase = await clienteServidor();
  const { data: empresa } = await supabase.from("empresa").select("ruc, razon_social").eq("id", 1).maybeSingle();
  if (!empresa) return { ok: false, error: "No están los datos fiscales de la empresa." };

  // La hora de emisión: ahora si es de hoy; si no, mediodía de su fecha.
  const fecha = g.fecha_emision.slice(0, 10);
  const emitidaEn = fecha === hoyLima() ? new Date() : new Date(`${fecha}T12:00:00-05:00`);

  const admin = clienteAdmin();
  // «Enviada» ANTES de llamar, como la factura, y como CANDADO: solo si
  // nadie la tiene en vuelo. Una enviada se pregunta, no se reenvía; pasados
  // 15 minutos sin ticket se da por muerta.
  const hace15 = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: tomada } = await admin
    .from("guias_remision")
    .update({ estado_sunat: "enviado", sunat_enviado_en: new Date().toISOString(), sunat_mensaje: null })
    .eq("id", id)
    .or(`estado_sunat.in.(no_enviado,pendiente,rechazado),and(estado_sunat.eq.enviado,sunat_ticket.is.null,sunat_enviado_en.lt.${hace15})`)
    .select("id");
  if (!tomada || tomada.length === 0) {
    return { ok: false, error: `${g.numero} ya se mandó y SUNAT la está revisando: pulsa «Preguntar a SUNAT».` };
  }

  let ticket: string;
  try {
    const envio = await conector.datos.emitirGuia(guiaParaSunat(g, { ruc: empresa.ruc, razonSocial: empresa.razon_social }, emitidaEn));
    ticket = envio.ticket;
    await admin.from("guias_remision").update({ sunat_ticket: ticket }).eq("id", id);
  } catch (e) {
    // Un corte se dice en cristiano, no «fetch failed» (auditoría 21/10).
    const mensaje = esErrorDeRed(e)
      ? MENSAJE_SIN_CONEXION
      : e instanceof Error
        ? e.message
        : "No se pudo hablar con SUNAT.";
    // Un 4xx de validación es un rechazo del documento; lo demás (red,
    // credenciales, 5xx) deja la guía pendiente para volver a intentarlo.
    const rechazo = e instanceof ErrorGre && e.http === 422;
    await admin
      .from("guias_remision")
      .update({
        estado_sunat: rechazo ? "rechazado" : "pendiente",
        sunat_codigo_respuesta: e instanceof ErrorGre ? e.codigo : null,
        sunat_mensaje: mensaje,
      })
      .eq("id", id);
    revalidatePath(`/guias/${id}`);
    revalidatePath("/sunat");
    return rechazo
      ? { ok: true, estado: "rechazada", mensaje: `SUNAT rechazó la guía ${g.numero}: ${mensaje}` }
      : { ok: false, error: mensaje };
  }

  // SUNAT suele contestar en segundos: se pregunta aquí un par de veces.
  for (const pausa of [1500, 2500, 4000]) {
    await esperar(pausa);
    try {
      const r = await conector.datos.consultarGuia(ticket);
      if (!("enProceso" in r)) return guardarRespuesta(id, g.numero, r);
    } catch {
      break;
    }
  }
  revalidatePath(`/guias/${id}`);
  revalidatePath("/sunat");
  return {
    ok: true,
    estado: "en_proceso",
    mensaje: `Enviada. SUNAT todavía la está revisando: pulsa «Preguntar a SUNAT» en un momento.`,
  };
}

/** Pregunta a SUNAT cómo quedó una guía ya enviada. */
export async function consultarGuiaSunat(id: string): Promise<ResultadoSunatGuia> {
  const negado = await puede();
  if (negado) return { ok: false, error: negado };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa guía no vale." };

  const { data: g } = await clienteAdmin()
    .from("guias_remision")
    .select("id, numero, sunat_ticket, estado_sunat")
    .eq("id", id)
    .maybeSingle();
  if (!g?.sunat_ticket) return { ok: false, error: "Esa guía todavía no se mandó a SUNAT." };

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };
  try {
    const r = await conector.datos.consultarGuia(g.sunat_ticket);
    if ("enProceso" in r) return { ok: true, estado: "en_proceso", mensaje: "SUNAT todavía la está revisando. Pregunta otra vez en un momento." };
    return guardarRespuesta(id, g.numero ?? "", r);
  } catch (e) {
    if (esErrorDeRed(e)) {
      return { ok: false, error: "No se pudo conectar con SUNAT (sin internet o SUNAT caído). La guía sigue enviada: vuelve a preguntar en unos minutos." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo hablar con SUNAT." };
  }
}
