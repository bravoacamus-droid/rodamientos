"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteAdmin } from "@rodatech/db/admin";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { conectorSunat } from "@/modules/facturacion/api/configuracion";

import { siguienteCorrelativoBaja, tipoSunatDe, type TipoDocumentoSunat } from "../dominio/bandeja";

/**
 * La comunicación de baja (125): decirle a SUNAT que una factura que ya
 * aceptó quedó anulada.
 *
 * Anular en el ERP la deja en `baja_solicitada`, y hasta hoy ahí se acababa:
 * el XML y el envío estaban escritos en `@rodatech/sunat` y ninguna pantalla
 * los llamaba. La factura salía anulada aquí y viva en SUNAT, con su deuda
 * a la vista del cliente.
 *
 * Es asíncrona: SUNAT devuelve un ticket y la respuesta se pregunta después
 * con «Preguntar a SUNAT». La comunican gerencia y admin, como anular.
 */

const ROLES = ["gerencia", "admin"] as const;

const hoyLima = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

export type ResultadoBaja = { ok: true; mensaje: string } | { ok: false; error: string };

/** Comunica la baja de los anulados de UNA fecha de emisión. */
export async function comunicarBaja(fechaDocumentos: string): Promise<ResultadoBaja> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  // Los mismos que pueden anular (gerencia y admin): es la otra mitad del acto.
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Solo Gerencia o Administración pueden comunicar bajas a SUNAT." };
  }
  if (!z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fechaDocumentos).success) {
    return { ok: false, error: "La fecha no es válida." };
  }

  const supabase = await clienteServidor();
  const [{ data: docs, error }, { data: enCurso }, { data: empresa }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("id, tipo, serie, correlativo, numero, motivo_anulacion")
      .eq("estado", "anulado")
      .neq("tipo", "boleta")
      .in("estado_sunat", ["baja_solicitada", "observado"])
      .eq("fecha_emision", fechaDocumentos),
    supabase.from("sunat_bajas").select("comprobantes").eq("estado", "enviada"),
    supabase.from("empresa").select("ruc, razon_social").eq("id", 1).maybeSingle(),
  ]);
  if (error) return { ok: false, error: error.message };
  if (!empresa) return { ok: false, error: "No están los datos fiscales de la empresa." };

  const ocupados = new Set((enCurso ?? []).flatMap((b) => b.comprobantes as string[]));
  const lista = (docs ?? []).filter((d) => !ocupados.has(d.id));
  if (lista.length === 0) return { ok: false, error: "No queda nada de esa fecha por dar de baja." };

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };

  const admin = clienteAdmin();
  const hoy = hoyLima();
  const { data: usados } = await admin.from("sunat_bajas").select("correlativo").eq("fecha_comunicacion", hoy);
  const correlativo = siguienteCorrelativoBaja((usados ?? []).map((u) => u.correlativo));

  try {
    const r = await conector.datos.emitirComunicacionBaja({
      correlativo,
      // Con su zona (Lima): sin ella, un servidor en UTC las corre un día.
      fechaEmisionDocs: new Date(`${fechaDocumentos}T00:00:00-05:00`),
      fechaComunicacion: new Date(`${hoy}T00:00:00-05:00`),
      emisor: { ruc: empresa.ruc, razonSocial: empresa.razon_social },
      documentos: lista.map((d) => ({
        tipoDocumento: tipoSunatDe(d.tipo as TipoDocumentoSunat),
        serie: d.serie,
        correlativo: d.correlativo,
        // SUNAT admite 100 caracteres de motivo.
        motivo: (d.motivo_anulacion?.trim() || "Anulación de la operación").slice(0, 100),
      })),
    });
    if (!r.aceptadoEnvio || !r.ticket) {
      return { ok: false, error: r.error ?? "SUNAT no recibió la comunicación de baja." };
    }

    const identificador = r.nombre.split("-").slice(1).join("-");
    const { error: errorFila } = await admin.from("sunat_bajas").insert({
      fecha_comunicacion: hoy,
      correlativo,
      identificador,
      fecha_documentos: fechaDocumentos,
      comprobantes: lista.map((d) => d.id),
      ticket: r.ticket,
      creado_por: perfil.id,
    });
    if (errorFila) return { ok: false, error: `SUNAT dio el ticket ${r.ticket}, pero no se pudo guardar: ${errorFila.message}` };
    await admin.from("comprobantes").update({ sunat_ticket: r.ticket }).in("id", lista.map((d) => d.id));

    revalidatePath("/sunat");
    return {
      ok: true,
      mensaje: `Enviada (${identificador}, ${lista.length} ${lista.length === 1 ? "documento" : "documentos"}). SUNAT la revisa en unos minutos: pulsa «Preguntar a SUNAT» para ver si la aceptó.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo hablar con SUNAT." };
  }
}

/** Pregunta a SUNAT cómo quedó una comunicación de baja, por su ticket. */
export async function consultarBaja(id: string): Promise<ResultadoBaja> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!["gerencia", "admin", "ventas"].includes(perfil.rol)) {
    return { ok: false, error: "Tu rol no puede consultar a SUNAT." };
  }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa baja no vale." };

  const admin = clienteAdmin();
  const { data: baja } = await admin
    .from("sunat_bajas")
    .select("id, ticket, estado, comprobantes, identificador")
    .eq("id", id)
    .maybeSingle();
  if (!baja?.ticket) return { ok: false, error: "Esa baja no tiene ticket." };
  if (baja.estado !== "enviada") return { ok: true, mensaje: "Ya tiene respuesta de SUNAT." };

  const conector = await conectorSunat();
  if (!conector.ok) return { ok: false, error: conector.error };

  try {
    const r = await conector.datos.consultarResumen(baja.ticket);
    if ("enProceso" in r) return { ok: true, mensaje: "SUNAT todavía la está revisando. Pregunta otra vez en unos minutos." };

    const ahora = new Date().toISOString();
    await admin
      .from("sunat_bajas")
      .update({ estado: r.aceptado ? "aceptada" : "rechazada", codigo: r.codigo, mensaje: r.descripcion, actualizado_en: ahora })
      .eq("id", baja.id);
    // Aceptada: los documentos quedan dados de baja. Rechazada: siguen en
    // «baja solicitada» y vuelven a la lista para mandarlos otra vez.
    if (r.aceptado) {
      await admin
        .from("comprobantes")
        .update({ estado_sunat: "baja_aceptada", sunat_codigo_respuesta: r.codigo, sunat_mensaje: r.descripcion })
        .in("id", baja.comprobantes);
    }
    revalidatePath("/sunat");
    revalidatePath("/facturacion");
    return r.aceptado
      ? { ok: true, mensaje: `SUNAT aceptó la baja ${baja.identificador}.` }
      : { ok: false, error: `SUNAT rechazó la baja ${baja.identificador}: ${r.descripcion}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo hablar con SUNAT." };
  }
}
