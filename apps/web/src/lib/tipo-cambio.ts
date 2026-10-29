import "server-only";

import { tipoCambioSunat, type ContextoConsultas } from "@rodatech/consultas";
import { envOpcional } from "@rodatech/config";
import { clienteServidor } from "@rodatech/db/servidor";

/**
 * El tipo de cambio de SUNAT de un día (o de hoy), para quien ya pasó su
 * puerta de rol. Lo comparten la compra en soles y el papel de la cotización
 * en soles (13/10); cada Server Action pone su propia puerta y llama aquí.
 *
 * Es una ayuda, nunca un requisito: si SUNAT no responde, si no hay token o
 * si se agotó la cuota, se devuelve el motivo y la persona escribe el número
 * a mano.
 */

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

/** La fecha de hoy en Lima, YYYY-MM-DD: el servidor de Vercel vive en UTC. */
function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function consultarTipoCambio(fecha?: unknown): Promise<ResultadoTipoCambio> {
  // Los argumentos de una Server Action llegan del navegador.
  const dia =
    typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined;

  try {
    const supabase = await clienteServidor();

    // 172: primero lo guardado. Un día que ya se trajo una vez —por la
    // factura, la compra o la cotización— no vuelve a salir a Decolecta.
    // Solo el día exacto: el «último publicado» de domingos y feriados lo
    // decide SUNAT, y Decolecta ya lo resuelve así.
    const fechaBuscada = dia ?? hoyEnLima();
    const { data: guardado } = await supabase
      .from("tipos_cambio_sunat")
      .select("fecha, compra, venta")
      .eq("fecha", fechaBuscada)
      .maybeSingle();
    if (guardado && guardado.compra !== null && Number(guardado.venta) > 0) {
      return {
        ok: true,
        venta: Number(guardado.venta),
        compra: Number(guardado.compra),
        fecha: String(guardado.fecha),
      };
    }

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

    // Y lo traído queda guardado. Con la fecha que dice SUNAT, no la pedida:
    // un domingo devuelve el del sábado, y guardarlo como domingo sería
    // inventar un dato. Si falla, el número ya está en la mano.
    if (Number.isFinite(compra) && /^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) {
      await supabase.rpc("guardar_cambio_sunat", {
        p_fecha: fila.fecha,
        p_compra: compra,
        p_venta: venta,
      });
    }

    return { ok: true, venta, compra, fecha: fila.fecha };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el tipo de cambio.",
    };
  }
}
