import "server-only";

import { headers } from "next/headers";
import { clienteAdmin, hayClaveAdmin } from "@rodatech/db/admin";

/**
 * El límite de intentos de inicio de sesión (136).
 *
 * Supabase ve todos los intentos desde la IP del servidor, así que su límite
 * no distingue a un empleado de un script. Este cuenta por CORREO y por la IP
 * real del navegador (`x-forwarded-for`, que en Vercel pone el propio borde).
 *
 * Va con la clave de servicio porque las dos funciones solo se conceden a
 * `service_role`: si fueran de `anon`, cualquiera podría llenar la tabla o
 * borrar sus propios fallos. Sin la clave (desarrollo) no limita.
 */

async function ipDelCliente(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip || null;
}

/** Segundos que faltan para poder volver a probar; 0 si puede. */
export async function esperaParaEntrar(correo: string): Promise<number> {
  if (!hayClaveAdmin()) return 0;
  try {
    const { data, error } = await clienteAdmin().rpc("login_espera", {
      p_correo: correo,
      p_ip: (await ipDelCliente()) ?? "",
    });
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    // Si el límite falla, no se deja a nadie fuera: Supabase sigue validando.
    return 0;
  }
}

export async function apuntarIntento(correo: string, exito: boolean): Promise<void> {
  if (!hayClaveAdmin()) return;
  try {
    await clienteAdmin().rpc("login_registrar", {
      p_correo: correo,
      p_ip: (await ipDelCliente()) ?? "",
      p_exito: exito,
    });
  } catch {
    // Igual que arriba: apuntar el intento nunca tumba el login.
  }
}

/** «15 minutos», «1 minuto». */
export function minutosDeEspera(segundos: number): string {
  const m = Math.max(1, Math.ceil(segundos / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}
