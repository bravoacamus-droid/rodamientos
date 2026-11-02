"use server";

import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { enviarComprobante, type ResultadoEnvio } from "../api/envio";

/**
 * «Enviar a SUNAT» desde la pantalla. El envío vive en `api/envio.ts` (183),
 * que también usa el reenvío automático; aquí quedan la sesión y el permiso.
 */

export type { ResultadoEnvio };

const esquema = z.object({ id: z.string().uuid() });

export async function enviarASunat(
  _previo: ResultadoEnvio | null,
  formData: FormData,
): Promise<ResultadoEnvio> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("facturacion", "editar");
  if (negado) {
    return { ok: false, error: negado };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({ id: formData.get("id") });
  } catch {
    return { ok: false, error: "Falta el comprobante a enviar." };
  }

  return enviarComprobante(datos.id, await clienteServidor());
}
