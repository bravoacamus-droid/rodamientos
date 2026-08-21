import "server-only";

import { createClient } from "@supabase/supabase-js";
import { envOpcional, requerirEnv, ROLES_ADMIN } from "@rodatech/config";

import type { Database } from "./tipos";
import { perfilActual } from "./servidor";

/**
 * Cliente con service_role: SALTA RLS POR COMPLETO.
 *
 * Solo existe para lo que la Admin API de Supabase exige y no se puede hacer
 * de otra forma — hoy, únicamente el alta y baja de usuarios.
 *
 * Reglas de uso, sin excepciones:
 *   · Solo en Server Actions o route handlers. El import de "server-only"
 *     hace que el build falle si alguien lo arrastra a un componente cliente.
 *   · SIEMPRE detrás de exigirAdmin(). Nunca lo llames sin verificar el rol:
 *     con esta clave, un fallo de autorización es un fallo total.
 *   · Nunca lo devuelvas ni lo filtres a la respuesta.
 */
export function clienteAdmin() {
  const clave = envOpcional("SUPABASE_SERVICE_ROLE_KEY");
  if (!clave) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Sin ella el ERP funciona igual, " +
        "salvo el alta de usuarios desde Configuración.",
    );
  }

  return createClient<Database>(requerirEnv("NEXT_PUBLIC_SUPABASE_URL"), clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** ¿Está configurado el alta de usuarios? La interfaz lo consulta para no
 *  ofrecer un botón que va a fallar. */
export function hayClaveAdmin(): boolean {
  return Boolean(envOpcional("SUPABASE_SERVICE_ROLE_KEY"));
}

/**
 * Verifica que quien llama tiene rol de administración. Lanza si no.
 *
 * Es la única puerta a clienteAdmin(). Se apoya en perfilActual(), que lee el
 * rol de la tabla `perfiles` y no de los metadatos del JWT — los metadatos los
 * puede editar el propio usuario, la tabla no.
 */
export async function exigirAdmin() {
  const perfil = await perfilActual();

  if (!perfil) {
    throw new Error("No hay sesión.");
  }
  if (!perfil.activo) {
    throw new Error("La cuenta está desactivada.");
  }
  if (!ROLES_ADMIN.includes(perfil.rol)) {
    throw new Error("Hace falta rol de gerencia o administración.");
  }

  return perfil;
}
