"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { consultarTipoCambio, type ResultadoTipoCambio } from "@/lib/tipo-cambio";

/**
 * El tipo de cambio de hoy, para ver e imprimir una cotización en soles
 * (13/10).
 *
 * Luis: *«en cotización a veces lo quieren en soles; ¿podemos poner un botón
 * con el cambio del día traído por SUNAT para imprimir y ver en soles?»*.
 *
 * La puerta es «tener sesión», no un rol: cualquiera que pueda abrir la ficha
 * puede imprimirla, y el tipo de cambio de SUNAT es un dato público. Lo que
 * cuida la cuota es la caché del paquete, que guarda el de hoy hasta la
 * medianoche: imprimir veinte cotizaciones en soles es UNA consulta.
 */
export async function tipoCambioParaElPapel(): Promise<ResultadoTipoCambio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  return consultarTipoCambio();
}
