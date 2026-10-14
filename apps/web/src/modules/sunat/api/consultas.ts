import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { clasificarRechazo } from "@rodatech/sunat";

import { fallo } from "@/lib/errores";

import type { DocumentoBandeja, TipoDocumentoSunat } from "../dominio/bandeja";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

export interface Rechazado extends DocumentoBandeja {
  motivo: string;
  queHacer: string;
  reintentable: boolean;
}

export interface PorDarDeBaja extends DocumentoBandeja {
  motivo_anulacion: string | null;
}

export interface BajaEnviada {
  id: string;
  identificador: string;
  fecha_documentos: string;
  documentos: string[];
  estado: "enviada" | "aceptada" | "rechazada" | "error";
  mensaje: string | null;
  creado_en: string;
}

export interface Bandeja {
  porEnviar: DocumentoBandeja[];
  rechazados: Rechazado[];
  porDarDeBaja: PorDarDeBaja[];
  bajas: BajaEnviada[];
  aceptadosMes: number;
  ultimosAceptados: DocumentoBandeja[];
}

const COLUMNAS = `id, tipo, numero, fecha_emision, total, moneda, pen_total, estado, estado_sunat,
  sunat_codigo_respuesta, sunat_mensaje, motivo_anulacion, sunat_enviado_en, clientes(razon_social)`;

type Fila = {
  id: string;
  tipo: string;
  numero: string;
  fecha_emision: string;
  total: number | string;
  moneda: string | null;
  pen_total: number | string | null;
  estado: string;
  estado_sunat: string;
  sunat_codigo_respuesta: string | null;
  sunat_mensaje: string | null;
  motivo_anulacion: string | null;
  sunat_enviado_en: string | null;
  clientes: { razon_social: string } | null;
};

/** Un comprobante como lo pinta la bandeja: en su moneda (116). */
function aDocumento(f: Fila): DocumentoBandeja {
  const enSoles = f.moneda === "PEN" && f.pen_total != null;
  return {
    id: f.id,
    tipo: f.tipo as TipoDocumentoSunat,
    numero: f.numero,
    cliente: f.clientes?.razon_social ?? "—",
    fecha_emision: String(f.fecha_emision).slice(0, 10),
    total: Number(enSoles ? f.pen_total : f.total) || 0,
    moneda: enSoles ? "PEN" : "USD",
    estado_sunat: f.estado_sunat,
    codigo: f.sunat_codigo_respuesta,
    mensaje: f.sunat_mensaje,
  };
}

/**
 * Todo lo que espera algo de SUNAT, en una consulta por grupo.
 *
 * - **Por enviar:** vigentes que nunca llegaron (`no_enviado`, `pendiente`,
 *   o `enviado` a medias, que el barrendero de la 052 devuelve a pendiente).
 * - **Rechazados:** vigentes. Uno rechazado y ANULADO ya está resuelto.
 * - **Por dar de baja:** anulados que SUNAT había aceptado y no saben que se
 *   anularon, sin una comunicación en curso.
 */
export async function bandejaSunat(hoy: string): Promise<Resultado<Bandeja>> {
  try {
    const supabase = await clienteServidor();
    const inicioMes = `${hoy.slice(0, 7)}-01`;

    const [porEnviar, rechazados, porBaja, bajas, aceptados, ultimos] = await Promise.all([
      supabase
        .from("comprobantes")
        .select(COLUMNAS)
        .neq("estado", "anulado")
        .in("estado_sunat", ["no_enviado", "pendiente", "enviado"])
        .order("fecha_emision", { ascending: true })
        .limit(200),
      supabase
        .from("comprobantes")
        .select(COLUMNAS)
        .neq("estado", "anulado")
        .eq("estado_sunat", "rechazado")
        .order("fecha_emision", { ascending: false })
        .limit(200),
      supabase
        .from("comprobantes")
        .select(COLUMNAS)
        .eq("estado", "anulado")
        .in("estado_sunat", ["baja_solicitada", "observado"])
        .order("fecha_emision", { ascending: true })
        .limit(200),
      supabase
        .from("sunat_bajas")
        .select("id, identificador, fecha_documentos, comprobantes, estado, mensaje, creado_en")
        .order("creado_en", { ascending: false })
        .limit(20),
      supabase
        .from("comprobantes")
        .select("id", { count: "exact", head: true })
        .in("estado_sunat", ["aceptado", "observado"])
        .gte("fecha_emision", inicioMes),
      supabase
        .from("comprobantes")
        .select(COLUMNAS)
        .in("estado_sunat", ["aceptado", "observado"])
        .not("sunat_enviado_en", "is", null)
        .order("sunat_enviado_en", { ascending: false })
        .limit(5),
    ]);

    for (const r of [porEnviar, rechazados, porBaja, bajas, aceptados, ultimos]) {
      if (r.error) return fallo(r.error, "sunat/bandejaSunat");
    }

    // Los números de los documentos de cada baja, para decir qué lleva.
    const filasBajas = (bajas.data ?? []) as {
      id: string;
      identificador: string;
      fecha_documentos: string;
      comprobantes: string[];
      estado: BajaEnviada["estado"];
      mensaje: string | null;
      creado_en: string;
    }[];
    const idsEnBajas = [...new Set(filasBajas.flatMap((b) => b.comprobantes))];
    const numeros = new Map<string, string>();
    if (idsEnBajas.length > 0) {
      const { data } = await supabase.from("comprobantes").select("id, numero").in("id", idsEnBajas);
      for (const c of data ?? []) numeros.set(c.id, c.numero ?? "—");
    }
    // Lo que ya va en una comunicación en curso no se ofrece otra vez.
    const enCurso = new Set(filasBajas.filter((b) => b.estado === "enviada").flatMap((b) => b.comprobantes));

    return {
      ok: true,
      datos: {
        porEnviar: ((porEnviar.data ?? []) as unknown as Fila[]).map(aDocumento),
        rechazados: ((rechazados.data ?? []) as unknown as Fila[]).map((f) => {
          const r = clasificarRechazo(f.sunat_codigo_respuesta);
          return { ...aDocumento(f), motivo: f.sunat_mensaje || r.motivo, queHacer: r.queHacer, reintentable: r.reintentable };
        }),
        porDarDeBaja: ((porBaja.data ?? []) as unknown as Fila[])
          // Las boletas se dan de baja en el resumen diario, no aquí.
          .filter((f) => f.tipo !== "boleta" && !enCurso.has(f.id))
          .map((f) => ({ ...aDocumento(f), motivo_anulacion: f.motivo_anulacion })),
        bajas: filasBajas.map((b) => ({
          id: b.id,
          identificador: b.identificador,
          fecha_documentos: b.fecha_documentos,
          documentos: b.comprobantes.map((id) => numeros.get(id) ?? "—"),
          estado: b.estado,
          mensaje: b.mensaje,
          creado_en: b.creado_en,
        })),
        aceptadosMes: aceptados.count ?? 0,
        ultimosAceptados: ((ultimos.data ?? []) as unknown as Fila[]).map(aDocumento),
      },
    };
  } catch (e) {
    return fallo(e, "sunat/bandejaSunat");
  }
}

/** Cuántas cosas esperan en SUNAT, para el número del menú. */
export async function pendientesSunat(): Promise<number> {
  const supabase = await clienteServidor();
  const [a, b, c] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("id", { count: "exact", head: true })
      .neq("estado", "anulado")
      .in("estado_sunat", ["no_enviado", "pendiente", "enviado", "rechazado"]),
    // Pocas filas: los anulados que SUNAT todavía cree vivos.
    supabase
      .from("comprobantes")
      .select("id")
      .eq("estado", "anulado")
      .neq("tipo", "boleta")
      .in("estado_sunat", ["baja_solicitada", "observado"])
      .limit(500),
    supabase.from("sunat_bajas").select("comprobantes").eq("estado", "enviada"),
  ]);
  // Lo que ya va en una baja en curso espera a SUNAT, no a quien mira.
  const enCurso = new Set((c.data ?? []).flatMap((x) => x.comprobantes as string[]));
  const bajas = (b.data ?? []).filter((x) => !enCurso.has(x.id)).length;
  return (a.count ?? 0) + bajas;
}
