import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@rodatech/db/servidor";

/**
 * Cierra la sesión y manda al login con el motivo (revisión del 15/10).
 *
 * Existe porque el layout del ERP no puede borrar cookies —un componente de
 * servidor no escribe la respuesta— y a un usuario desactivado hay que
 * sacarlo de verdad, no solo esconderle el menú. Un route handler sí puede.
 */
export async function GET(request: NextRequest) {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = request.nextUrl.searchParams.get("motivo") === "inactivo" ? "?error=inactivo" : "";
  return NextResponse.redirect(destino);
}
