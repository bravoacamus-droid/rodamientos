import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./tipos";

/** Rutas que no exigen sesión. */
const PUBLICAS = ["/login", "/auth"];

/**
 * Refresca el token de sesión y decide si la petición puede seguir.
 *
 * Vive en este paquete y no en la app porque es el tercer sitio donde se
 * construye un cliente de Supabase, y la regla del monorepo es que todos
 * salgan de aquí.
 *
 * Es además el único lugar donde se pueden escribir las cookies del token
 * refrescado: corre antes que cualquier Server Component. Por eso
 * `clienteServidor()` puede ignorar sin riesgo su fallo al escribir cookies.
 */
export async function refrescarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta.startsWith(p));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Sin configuración no se puede validar ninguna sesión. Se falla CERRADO:
    // dejar pasar convertiría un error de despliegue en un ERP abierto de par
    // en par. No hay bucle porque /login es pública y muestra el error.
    if (esPublica) return respuesta;
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "?error=configuracion";
    return NextResponse.redirect(destino);
  }

  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(porEscribir) {
        for (const { name, value } of porEscribir) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of porEscribir) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() y no getSession(): valida el token contra el servidor de auth.
  // getSession() se fía de la cookie, que aquí es entrada no confiable.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !esPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    // Se recuerda a dónde iba, para devolverlo ahí tras iniciar sesión.
    destino.searchParams.set("destino", ruta);
    return NextResponse.redirect(destino);
  }

  if (user && ruta === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/dashboard";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}
