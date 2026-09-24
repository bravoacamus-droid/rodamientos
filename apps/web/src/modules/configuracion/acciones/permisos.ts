"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";
import { AREAS } from "../dominio/permisos";
import { ROLES, type Rol } from "../dominio/tipos";

export type ResultadoPermiso = { ok: true; mensaje: string } | { ok: false; error: string };

const esquema = z.object({
  area: z.string(),
  rol: z.enum(ROLES as unknown as [Rol, ...Rol[]]),
  puede: z.boolean(),
});

/**
 * Da o quita a un rol todo un área.
 *
 * La matriz `permisos_rol` lleva desde la 002 siendo «la forma declarativa de
 * cambiar quién escribe qué sin tocar una política» —lo dice su propio
 * comentario— y hasta hoy solo se podía cambiar por SQL. La pieza estaba; el
 * camino, no.
 *
 * ---------------------------------------------------------------------------
 * Gerencia, y nadie más
 * ---------------------------------------------------------------------------
 * La política de `permisos_rol` (006) ya exige `es_gerencia()`, así que la
 * base rechazaría a cualquier otro. La comprobación de aquí no sobra: sin
 * ella, un `admin` recibiría un error de RLS en crudo en vez de una frase, y
 * además esto es una Server Action, o sea un endpoint público.
 *
 * ---------------------------------------------------------------------------
 * Por qué no se deja tocar el propio rol de quien está mirando
 * ---------------------------------------------------------------------------
 * Es la misma regla que en `cambiarUsuario`, y por el mismo motivo: si el
 * único gerente se quita un área, no hay pantalla que se la devuelva. Aquí el
 * riesgo es menor —gerencia no pasa por la matriz para el ajuste ni para esta
 * misma pantalla— pero sí podría dejarse sin facturar, y arreglarlo sería
 * entrar por SQL.
 */
export async function cambiarPermisoArea(entrada: {
  area: string;
  rol: Rol;
  puede: boolean;
}): Promise<ResultadoPermiso> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (perfil.rol !== "gerencia") {
    return { ok: false, error: "Solo gerencia cambia los permisos." };
  }

  const datos = esquema.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Los datos no son válidos." };

  const { area: clave, rol, puede } = datos.data;

  if (rol === perfil.rol) {
    return {
      ok: false,
      error:
        "No puedes quitarte permisos a ti mismo: si gerencia se queda sin un área, ya nadie puede devolvérsela desde la aplicación.",
    };
  }

  const area = AREAS.find((a) => a.clave === clave);
  if (!area) return { ok: false, error: "Ese grupo de permisos no existe." };

  try {
    const supabase = await clienteServidor();

    if (puede) {
      /*
        `upsert` y no `insert`: el área puede estar a medias —la matriz se
        sembró tabla a tabla en la 007— y un insert a secas chocaría con la
        clave primaria en las que ya estén.
      */
      const { error } = await supabase.from("permisos_rol").upsert(
        area.tablas.map((tabla) => ({
          tabla,
          rol,
          escribir: true,
          nota: `${area.etiqueta} · desde Configuración`,
        })),
        { onConflict: "tabla,rol" },
      );
      if (error) return { ok: false, error: mensajeDeError(error) };
    } else {
      /*
        Se BORRA la fila en vez de poner `escribir` en false. `puede_escribir`
        busca una fila con `escribir`, así que las dos cosas funcionan — pero
        una fila que dice «no» y una fila ausente significarían lo mismo con
        dos formas de escribirlo, y la matriz dejaría de leerse de un vistazo.
      */
      const { error } = await supabase
        .from("permisos_rol")
        .delete()
        .eq("rol", rol)
        .in("tabla", [...area.tablas]);
      if (error) return { ok: false, error: mensajeDeError(error) };
    }

    revalidatePath("/configuracion/permisos");
    return {
      ok: true,
      mensaje: puede
        ? `${area.etiqueta}: ahora sí.`
        : `${area.etiqueta}: ahora no.`,
    };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}
