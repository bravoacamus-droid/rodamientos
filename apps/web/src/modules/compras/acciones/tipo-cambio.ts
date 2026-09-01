"use server";

import { tipoCambioSunat, type ContextoConsultas } from "@rodatech/consultas";
import { envOpcional } from "@rodatech/config";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * El tipo de cambio del día, para registrar una compra en soles.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe esto
 * ---------------------------------------------------------------------------
 * `packages/consultas/src/tipo-cambio.ts` estaba construido y probado desde el
 * principio del proyecto, con su caché y todo, y **no lo llamaba ni una
 * pantalla**. Se escribió para un caso que nunca llegó, porque el sistema
 * vende siempre en dólares.
 *
 * Lo que faltaba era el otro lado: Willy COMPRA en soles (01/09, 28:05), y sin
 * tipo de cambio el costo entra al inventario multiplicado por casi cuatro
 * (ver migración 042).
 *
 * ---------------------------------------------------------------------------
 * Esto es una ayuda, nunca un requisito
 * ---------------------------------------------------------------------------
 * Si SUNAT no responde, si no hay token o si se agotó la cuota, se devuelve el
 * motivo y la persona escribe el número a mano — lo tiene en la factura o en
 * cualquier buscador. Bloquear el registro de una compra porque una consulta
 * externa falló sería cambiar un problema de nadie por uno de Willy.
 */

/** La misma lista que puede registrar compras. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export type ResultadoTipoCambio =
  | { ok: true; venta: number; compra: number; fecha: string }
  | { ok: false; error: string };

/**
 * Contexto del paquete de consultas.
 *
 * Igual que en `lib/documento-sunat.ts`, y por el mismo motivo: el cliente va
 * con la identidad del usuario para que la caché y la cuota queden bajo RLS.
 */
async function contexto(): Promise<ContextoConsultas> {
  const supabase = await clienteServidor();
  return {
    cliente: supabase as unknown as ContextoConsultas["cliente"],
    token: envOpcional("DECOLECTA_TOKEN"),
    cuota: {
      plan: envOpcional("DECOLECTA_PLAN") ?? "free",
      limite: Number(envOpcional("DECOLECTA_QUOTA_LIMIT") ?? 100),
      reservaPorcentaje: Number(envOpcional("DECOLECTA_QUOTA_RESERVE_PCT") ?? 5),
      diaCicloReinicio: Number(envOpcional("DECOLECTA_QUOTA_CYCLE_DAY") ?? 1),
    },
    timeoutMs: Number(envOpcional("DECOLECTA_TIMEOUT_MS") ?? 10_000),
  };
}

export async function tipoCambioDelDia(fecha?: string): Promise<ResultadoTipoCambio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede registrar compras." };
  }

  // Los argumentos de una Server Action llegan del navegador.
  const dia =
    typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined;

  try {
    const r = await tipoCambioSunat(dia ? { fecha: dia } : {}, await contexto(), {
      // `normal` y no `critical`: se puede escribir a mano, así que no merece
      // gastar la reserva del final del ciclo.
      prioridad: "normal",
    });

    if (!r.ok || !r.datos || r.datos.length === 0) {
      // `mensaje` viene del paquete ya redactado en español y explicando
      // qué pasó —sin cupo, sin token, SUNAT caída—. Solo se sustituye
      // cuando la consulta fue bien pero no había dato: eso pasa en
      // domingos y feriados, y ahí el mensaje útil es otro.
      return {
        ok: false,
        error:
          r.mensaje ??
          "SUNAT no publicó el tipo de cambio de ese día. Escríbelo a mano.",
      };
    }

    // El paquete devuelve STRINGS a propósito, para no perder precisión
    // monetaria en el camino. Se convierten aquí, en el punto de uso, que es
    // donde de verdad hace falta un número.
    const fila = r.datos[0];
    if (!fila) {
      return { ok: false, error: "SUNAT no publicó el tipo de cambio de ese día." };
    }
    const venta = Number(fila.venta);
    const compra = Number(fila.compra);
    if (!Number.isFinite(venta) || venta <= 0) {
      return { ok: false, error: "El tipo de cambio que llegó no es un número válido." };
    }

    return { ok: true, venta, compra, fecha: fila.fecha };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el tipo de cambio.",
    };
  }
}
