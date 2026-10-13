"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarTipoCambio, type ResultadoTipoCambio } from "@/lib/tipo-cambio";

/**
 * El tipo de cambio venta del día de la factura, para saber si llega a los
 * S/ 700 desde los que se retiene (14/10). Es un dato público: la puerta es
 * tener sesión. La caché del paquete hace que sea una consulta por día.
 */
export async function tipoCambioParaFacturar(fecha: string): Promise<ResultadoTipoCambio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  return consultarTipoCambio(fecha);
}
