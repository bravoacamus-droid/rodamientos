"use server";

import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { mandarGuiaASunat, preguntarGuiaASunat, type ResultadoSunatGuia } from "../api/envio-sunat";

/**
 * Los botones de SUNAT de la guía. El envío vive en `api/envio-sunat.ts`
 * (183), que también usa el reenvío automático; aquí quedan sesión y permiso.
 */

export type { ResultadoSunatGuia };

async function puede(id: string): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const negado = await sinPermiso("guias", "editar");
  if (negado) return negado;
  if (!z.string().uuid().safeParse(id).success) return "Esa guía no vale.";
  return null;
}

export async function enviarGuiaASunat(id: string): Promise<ResultadoSunatGuia> {
  const negado = await puede(id);
  if (negado) return { ok: false, error: negado };
  return mandarGuiaASunat(id, await clienteServidor());
}

/** Pregunta a SUNAT cómo quedó una guía ya enviada. */
export async function consultarGuiaSunat(id: string): Promise<ResultadoSunatGuia> {
  const negado = await puede(id);
  if (negado) return { ok: false, error: negado };
  return preguntarGuiaASunat(id);
}
