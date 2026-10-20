"use server";

import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { consultarTipoCambio, type ResultadoTipoCambio } from "@/lib/tipo-cambio";

export type { ResultadoTipoCambio };

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

export async function tipoCambioDelDia(fecha?: string): Promise<ResultadoTipoCambio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const prohibido = await sinPermiso("compras", "crear");
  if (prohibido) {
    return { ok: false, error: prohibido };
  }

  return consultarTipoCambio(fecha);
}
