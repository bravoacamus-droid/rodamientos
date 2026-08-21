import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { requerirEnv } from "@rodatech/config";

import type { Database } from "./tipos";

/**
 * Cliente de Supabase para Server Components, Server Actions y route handlers.
 *
 * Va envuelto en `cache()` de React para que dentro de un mismo request se
 * construya una sola vez: un módulo del ERP puede lanzar seis consultas en
 * paralelo y todas deben compartir la misma sesión, no abrir seis clientes.
 *
 * Actúa siempre con la identidad del usuario, así que RLS aplica. Para saltarse
 * RLS hace falta el cliente de ./admin, y eso es deliberadamente incómodo.
 */
export const clienteServidor = cache(async () => {
  const almacen = await cookies();

  return createServerClient<Database>(
    requerirEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requerirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(porEscribir) {
          try {
            for (const { name, value, options } of porEscribir) {
              almacen.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies. Es esperado:
            // el middleware ya refrescó la sesión antes de llegar aquí, así que
            // ignorar esto es correcto y no pierde el refresco del token.
          }
        },
      },
    },
  );
});

/**
 * Devuelve el usuario autenticado, o null.
 *
 * Usa getUser() y no getSession(): getSession() lee la cookie sin validarla
 * contra el servidor de auth, y en el servidor esa cookie es manipulable.
 * Memoizado por request para no repetir la llamada en cada componente.
 */
export const usuarioActual = cache(async () => {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Perfil del usuario con su rol. El rol vive en la tabla `perfiles`, no en los
 * metadatos del JWT, porque los metadatos los puede editar el propio usuario.
 */
export const perfilActual = cache(async () => {
  const usuario = await usuarioActual();
  if (!usuario) return null;

  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, email, rol, activo, cargo")
    .eq("id", usuario.id)
    .maybeSingle();

  return data ?? null;
});
