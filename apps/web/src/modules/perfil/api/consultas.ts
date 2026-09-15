import "server-only";

import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { MiPerfil } from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Mi propia ficha.
 *
 * No recibe un id: lo saca de la sesión. Es la diferencia entre «mi perfil» y
 * «el perfil de alguien», y es lo que hace que esta lectura no tenga que
 * comprobar permisos — no hay forma de pedir la de otro.
 *
 * `perfilActual()` de @rodatech/db no sirve aquí: trae lo que necesita el
 * layout —nombre, rol, activo— y le faltan el teléfono y el último acceso, que
 * son la mitad de esta pantalla.
 */
export async function miPerfil(): Promise<Resultado<MiPerfil | null>> {
  try {
    const usuario = await usuarioActual();
    if (!usuario) return { ok: true, datos: null };

    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre, email, telefono, cargo, rol, ultimo_acceso")
      .eq("id", usuario.id)
      .maybeSingle();

    if (error) return fallo(error, "perfil/miPerfil");
    if (!data) return { ok: true, datos: null };

    return {
      ok: true,
      datos: {
        id: String(data.id),
        nombre: String(data.nombre ?? ""),
        email: (data.email as string | null) ?? null,
        telefono: (data.telefono as string | null) ?? null,
        cargo: (data.cargo as string | null) ?? null,
        rol: String(data.rol),
        ultimo_acceso: (data.ultimo_acceso as string | null) ?? null,
      },
    };
  } catch (e) {
    return fallo(e, "perfil/miPerfil");
  }
}
