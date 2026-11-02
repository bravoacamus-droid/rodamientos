import "server-only";

import { timingSafeEqual } from "node:crypto";
import { envOpcional } from "@rodatech/config";

/**
 * ¿La llamada viene del cron? Vercel Cron y el cron de Supabase (pg_net)
 * firman con `Authorization: Bearer <CRON_SECRET>`, comparado en tiempo
 * constante. Sin `CRON_SECRET` en el entorno, nadie pasa: falla CERRADO.
 */
export function llamadaDelCron(cabecera: string | null): boolean {
  const secreto = envOpcional("CRON_SECRET");
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(cabecera ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
