import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { Canal, Plantilla, Uso } from "../dominio/plantillas";

/**
 * Las plantillas que se pueden mandar.
 *
 * Se leen enteras: son unas pocas filas de texto que edita una persona a mano,
 * y paginarlas sería paginar una lista que nunca va a pasar de diez.
 */

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };


const USOS: readonly Uso[] = ["pedido_precio", "cotizacion", "cobranza", "general"];
const CANALES: readonly Canal[] = ["whatsapp", "correo"];

const aPlantilla = (f: Record<string, unknown>): Plantilla => ({
  id: String(f.id),
  nombre: String(f.nombre ?? ""),
  // El enum viene de Postgres, así que solo puede ser uno de estos. El
  // `find` es para que TypeScript lo sepa, no por desconfianza.
  uso: USOS.find((u) => u === f.uso) ?? "general",
  canal: CANALES.find((c) => c === f.canal) ?? "whatsapp",
  asunto: (f.asunto as string | null) ?? null,
  cuerpo: String(f.cuerpo ?? ""),
  predeterminada: Boolean(f.predeterminada),
  activa: Boolean(f.activa),
});

const COLUMNAS = "id, nombre, uso, canal, asunto, cuerpo, predeterminada, activa";

/** Todas, incluidas las dadas de baja, para poder reactivarlas. */
export async function plantillas(uso?: Uso): Promise<Resultado<Plantilla[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("plantillas_mensaje")
      .select(COLUMNAS)
      .order("uso")
      .order("canal")
      .order("predeterminada", { ascending: false })
      .order("nombre");

    if (uso) consulta = consulta.eq("uso", uso);

    const { data, error } = await consulta;
    if (error) return fallo(error);

    return { ok: true, datos: (data ?? []).map((f) => aPlantilla(f as Record<string, unknown>)) };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Las que se pueden usar para un envío: activas y de ese uso.
 *
 * La predeterminada sale primera para que la pantalla proponga esa sin tener
 * que buscarla.
 */
export async function plantillasParaMandar(uso: Uso): Promise<Resultado<Plantilla[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("plantillas_mensaje")
      .select(COLUMNAS)
      .eq("uso", uso)
      .eq("activa", true)
      // WhatsApp primero: el enum `canal_mensaje` lo declara antes que
      // `correo`, y es por donde Willy pide precio de siempre (30:01). Sin
      // esto la pantalla proponía la plantilla de correo, que es la que va
      // detrás en orden alfabético.
      .order("canal")
      .order("predeterminada", { ascending: false })
      .order("nombre");

    if (error) return fallo(error);
    return { ok: true, datos: (data ?? []).map((f) => aPlantilla(f as Record<string, unknown>)) };
  } catch (e) {
    return fallo(e);
  }
}
