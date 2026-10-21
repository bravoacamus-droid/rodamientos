import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Cierra la sesión y manda al login con el motivo (revisión del 15/10).
 *
 * Existe porque el layout del ERP no puede borrar cookies —un componente de
 * servidor no escribe la respuesta— y a un usuario desactivado hay que
 * sacarlo de verdad, no solo esconderle el menú. Un route handler sí puede.
 */
export async function GET(request: NextRequest) {
  /*
    Solo desde el propio ERP o tecleada a mano (auditoría 21/10). Un GET que
    cierra la sesión lo dispara cualquier `<img src=".../salir">` de otra web
    y saca a Willy a mitad de una cotización. `Sec-Fetch-Site` lo pone el
    navegador y una página no lo puede falsificar: «same-origin» es la
    redirección del layout, «none» es la barra de direcciones. Sin la
    cabecera (navegador viejo) se deja pasar, como antes.

    El botón de «Cerrar sesión» no pasa por aquí: es la Server Action
    `cerrarSesion`, que va por POST.
  */
  const origen = request.headers.get("sec-fetch-site");
  const deFuera = Boolean(origen && origen !== "same-origin" && origen !== "none");
  /*
    Pero a quien de verdad está de baja se le saca siempre. Si llegó desde un
    enlace de otra web, mandarlo a /dashboard lo devolvía aquí por el layout,
    y así sin fin. Se mira el perfil, no el `?motivo`, que lo escribe cualquiera.
  */
  const perfil = deFuera ? await perfilActual() : null;
  if (deFuera && perfil?.activo) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/dashboard";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = request.nextUrl.searchParams.get("motivo") === "inactivo" ? "?error=inactivo" : "";
  return NextResponse.redirect(destino);
}
