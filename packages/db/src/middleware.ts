import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./tipos";

/**
 * Rutas que no exigen sesión.
 *
 * `/ver/` es la cotización que se le manda al cliente por enlace (072). Es la
 * única parte del ERP que se abre sin saber quién pregunta, y tiene que serlo:
 * el cliente de Willy no tiene usuario y nunca lo va a tener.
 *
 * Lo que la protege no es esta lista sino el token de 32 caracteres de la URL
 * y `cotizacion_por_token`, que filtra por token exacto y devuelve SOLO lo que
 * va impreso — sin costos, sin margen y sin el contacto del cliente.
 *
 * Va con la barra final. Sin ella, `startsWith("/ver")` abriría también
 * `/verificar`, `/ventas` o cualquier ruta futura que empiece igual, y eso es
 * exactamente la clase de agujero que nadie nota hasta que ya está abierto.
 */
const PUBLICAS = ["/ver/"];

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
export interface OpcionesSesion {
  /**
   * La puerta de «Ver» de cada pantalla (143), decidida AQUÍ y no en el
   * navegador (auditoría 21/10, M9).
   *
   * Hasta entonces la ponía `GuardaVer`, que es un componente de cliente: el
   * servidor generaba la página entera —con sus datos— y el navegador la
   * tapaba con «No puedes abrir esta pantalla». Ventas que tecleaba
   * `/configuracion/usuarios` recibía en la respuesta los correos de las
   * nueve cuentas. Y ponerla en el layout tampoco basta: Next pinta el layout
   * y la página en paralelo, así que la página sale igual.
   *
   * Es una función que recibe la app porque las reglas (qué ruta pide qué
   * módulo) viven en su `navegacion.ts`, no en este paquete.
   */
  puedeVer?: (ruta: string, rol: string | null, permisos: readonly string[]) => boolean;
  /** A dónde se reescribe lo que no se puede ver. La URL del navegador no cambia. */
  rutaSinPermiso?: string;
}

export async function refrescarSesion(request: NextRequest, opciones: OpcionesSesion = {}) {
  let respuesta = NextResponse.next({ request });

  const ruta = request.nextUrl.pathname;
  // `/login` exacta: con `startsWith` se abría también `/loginX`.
  const esPublica = ruta === "/login" || PUBLICAS.some((p) => ruta.startsWith(p));

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

  /*
    Solo GET y HEAD: las Server Actions van por POST a la ruta de la página
    desde la que se llaman, y esas se defienden solas con `sinPermiso`.

    Primero se pregunta sin rol ni permisos: si la ruta no pide nada (el
    tablero, el perfil, una ruta que no está en el menú) no se gasta la
    consulta. Solo las que piden un módulo pagan una llamada a
    `mis_permisos`. Si esa llamada falla, se cierra: vale más un «no puedes»
    de más que una pantalla abierta.
  */
  const { puedeVer } = opciones;
  if (
    user &&
    !esPublica &&
    puedeVer &&
    (request.method === "GET" || request.method === "HEAD") &&
    !puedeVer(ruta, null, [])
  ) {
    const { data } = await supabase.rpc("mis_permisos");
    const mios = (data ?? null) as { rol?: string | null; permisos?: string[] } | null;
    if (!puedeVer(ruta, mios?.rol ?? null, mios?.permisos ?? [])) {
      const destino = request.nextUrl.clone();
      destino.pathname = opciones.rutaSinPermiso ?? "/sin-permiso";
      destino.search = "";
      const reescrita = NextResponse.rewrite(destino, { request });
      // Las cookies del token recién refrescado, que si no se perderían.
      for (const c of respuesta.cookies.getAll()) reescrita.cookies.set(c);
      return reescrita;
    }
  }

  return respuesta;
}
