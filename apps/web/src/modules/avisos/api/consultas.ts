import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { envOpcional } from "@rodatech/config";

import { fallo } from "@/lib/errores";

import { esSeveridad, type Severidad } from "../dominio/envio";
import { pushConfigurado } from "./push";

export interface MiAparato {
  id: string;
  endpoint: string;
  aparato: string;
  creada_en: string;
  ultimo_envio: string | null;
  ultimo_error: string | null;
  activa: boolean;
  severidad_minima: Severidad;
}

export interface MisAvisos {
  aparatos: MiAparato[];
  /** La clave pública VAPID, o null si el servidor no tiene los avisos configurados. */
  clavePublica: string | null;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Mis aparatos. Sin id: RLS devuelve solo los de la sesión. */
export async function misAvisos(): Promise<Resultado<MisAvisos>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("suscripciones_push")
      .select("id, endpoint, aparato, creada_en, ultimo_envio, ultimo_error, activa, severidad_minima")
      .order("creada_en", { ascending: false });
    if (error) return fallo(error, "avisos/misAvisos");

    return {
      ok: true,
      datos: {
        aparatos: (data ?? []).map((a) => ({
          id: a.id,
          endpoint: a.endpoint,
          aparato: a.aparato ?? "Aparato sin nombre",
          creada_en: a.creada_en,
          ultimo_envio: a.ultimo_envio,
          ultimo_error: a.ultimo_error,
          activa: a.activa,
          severidad_minima: esSeveridad(a.severidad_minima) ? a.severidad_minima : "media",
        })),
        clavePublica: pushConfigurado() ? (envOpcional("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? null) : null,
      },
    };
  } catch (e) {
    return fallo(e, "avisos/misAvisos");
  }
}
