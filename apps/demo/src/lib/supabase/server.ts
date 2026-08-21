import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { credencialesSupabase } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = credencialesSupabase();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Invocado desde un Server Component: el middleware ya refresca la sesión.
          }
        },
      },
    }
  );
}

/** Usuario + perfil de la sesión actual, memoizado por request. */
export const getSesion = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, cargo, telefono, activo")
    .eq("id", user.id)
    .single();

  return { user, perfil };
});

/** Datos de la empresa para cabeceras y documentos, memoizado por request. */
export const getEmpresa = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("empresa").select("*").eq("id", 1).single();
  return data;
});
