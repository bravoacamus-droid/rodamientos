"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarTipoCambio, type ResultadoTipoCambio } from "@/lib/tipo-cambio";

/**
 * El tipo de cambio venta del día del pago, para un cobro en soles (14/10).
 * Dato público: la puerta es tener sesión. Una consulta por día (caché).
 */
export async function tipoCambioDelPago(fecha: string): Promise<ResultadoTipoCambio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  return consultarTipoCambio(fecha);
}
