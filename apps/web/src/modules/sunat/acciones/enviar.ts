"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { enviarASunat } from "@/modules/facturacion/acciones/enviar";

import { ordenDeEnvio, type TipoDocumentoSunat } from "../dominio/bandeja";

/**
 * «Enviar todas» (15/10): varios comprobantes a SUNAT, uno detrás de otro.
 *
 * No en paralelo, y es a propósito: una nota tiene que llegar DESPUÉS de su
 * factura (SUNAT rechaza la nota de un documento que no conoce), y SUNAT
 * corta a quien le manda ráfagas. Cada uno pasa por el mismo `enviarASunat`
 * que el botón de su ficha: una sola forma de enviar, con sus mismas puertas.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;
// Diez por tanda: cada uno es una llamada a SUNAT, y una acción no puede
// ocupar al servidor indefinidamente. «Quedan N» invita a seguir.
const MAXIMO = 10;

export interface ResultadoUno {
  id: string;
  numero: string;
  aceptado: boolean;
  mensaje: string;
}

export type ResultadoVarios = { ok: true; resultados: ResultadoUno[]; quedan: number } | { ok: false; error: string };

export async function enviarVarios(ids: string[]): Promise<ResultadoVarios> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede enviar comprobantes a SUNAT." };
  }
  const validos = z.array(z.string().uuid()).min(1).max(500).safeParse(ids);
  if (!validos.success) return { ok: false, error: "No llegó ningún comprobante que enviar." };

  // Se releen: el orden y qué sigue pendiente lo decide la base, no la pantalla.
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("comprobantes")
    .select("id, tipo, numero, fecha_emision")
    .in("id", validos.data)
    .neq("estado", "anulado")
    // «enviado» no: está en vuelo, y reenviarlo lo mandaría dos veces.
    .in("estado_sunat", ["no_enviado", "pendiente", "rechazado"]);
  if (error) return { ok: false, error: error.message };

  const todos = ordenDeEnvio(
    (data ?? []).map((d) => ({ ...d, numero: d.numero ?? "—", tipo: d.tipo as TipoDocumentoSunat, fecha_emision: String(d.fecha_emision) })),
  );
  const lote = todos.slice(0, MAXIMO);

  const resultados: ResultadoUno[] = [];
  for (const d of lote) {
    const fd = new FormData();
    fd.set("id", d.id);
    const r = await enviarASunat(null, fd);
    resultados.push(
      r.ok
        ? { id: d.id, numero: d.numero, aceptado: r.aceptado, mensaje: r.mensaje }
        : { id: d.id, numero: d.numero, aceptado: false, mensaje: r.error },
    );
  }

  revalidatePath("/sunat");
  revalidatePath("/facturacion");
  return { ok: true, resultados, quedan: todos.length - lote.length };
}
