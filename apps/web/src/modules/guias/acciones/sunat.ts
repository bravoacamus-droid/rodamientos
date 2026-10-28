"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import type { Json } from "@rodatech/db/tipos";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import { esErrorDeRed } from "@rodatech/sunat";

import { bloqueoPorSeriePrueba, conectorSunat, modoGuias } from "@/modules/facturacion/api/configuracion";

import { detalleGuia } from "../api/consultas";
import { mandarGuia, preguntarGuia, type CambiosGuia, type Desenlace, type PuertoGuia } from "../dominio/envio-sunat";
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
 * da un ticket, y la respuesta se pregunta. El viaje entero —preguntar por el
 * ticket anterior antes de reenviar, guardar el CDR, no dar por rechazada una
 * guía que SUNAT ya tiene— está en `dominio/envio-sunat.ts` (auditoría SUNAT
 * 28/10, M4 y M5); aquí quedan los permisos, el candado y la base.
 */

export type ResultadoSunatGuia = Desenlace;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hoyLima = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

async function puede(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const negado = await sinPermiso("guias", "editar");
  if (negado) return negado;
  return null;
}

/** Escribe en la guía con service_role (127: las columnas de SUNAT solo las toca el servidor). */
function puertoGuia(id: string): PuertoGuia {
  return {
    async guardar(cambios: CambiosGuia) {
      const { sunat_respuesta, ...resto } = cambios;
      await clienteAdmin()
        .from("guias_remision")
        .update({
          ...resto,
          ...(sunat_respuesta !== undefined ? { sunat_respuesta: sunat_respuesta as unknown as Json } : {}),
        })
        .eq("id", id);
    },
  };
}

function refrescar(id: string) {
  revalidatePath(`/guias/${id}`);
  revalidatePath("/guias");
  revalidatePath("/sunat");
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
  // Lo del intento anterior, ANTES de que el candado lo pise: el ticket es lo
  // único con lo que se puede preguntar a SUNAT qué pasó (M5).
  const { data: antes } = await admin
    .from("guias_remision")
    .select("sunat_ticket, sunat_enviado_en")
    .eq("id", id)
    .maybeSingle();

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

  const datos = conector.datos;
  const resultado = await mandarGuia({
    numero: g.numero,
    previo: { ticket: antes?.sunat_ticket ?? null, yaSeMando: Boolean(antes?.sunat_enviado_en) },
    sunat: {
      enviar: () => datos.emitirGuia(guiaParaSunat(g, { ruc: empresa.ruc, razonSocial: empresa.razon_social }, emitidaEn)),
      consultar: (ticket) => datos.consultarGuia(ticket),
    },
    guia: puertoGuia(id),
    esperar,
  });
  refrescar(id);
  return resultado;
}

/** Pregunta a SUNAT cómo quedó una guía ya enviada. */
export async function consultarGuiaSunat(id: string): Promise<ResultadoSunatGuia> {
  const negado = await puede();
  if (negado) return { ok: false, error: negado };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa guía no vale." };

  const { data: g } = await clienteAdmin()
    .from("guias_remision")
    .select("id, numero, sunat_ticket")
    .eq("id", id)
    .maybeSingle();
  if (!g?.sunat_ticket) return { ok: false, error: "Esa guía todavía no se mandó a SUNAT." };

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };
  const datos = conector.datos;
  try {
    const r = await preguntarGuia({
      numero: g.numero ?? "",
      ticket: g.sunat_ticket,
      sunat: { consultar: (ticket) => datos.consultarGuia(ticket) },
      guia: puertoGuia(id),
    });
    refrescar(id);
    return r;
  } catch (e) {
    if (esErrorDeRed(e)) {
      return { ok: false, error: "No se pudo conectar con SUNAT (sin internet o SUNAT caído). La guía sigue enviada: vuelve a preguntar en unos minutos." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo hablar con SUNAT." };
  }
}
