import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { libroDetalle } from "@/modules/tablero/api/excel";
import { opcionesDetalleDeUrl } from "@/modules/tablero/api/detalle-url";

/**
 * El detalle de ventas o de cotizaciones en Excel, con los filtros del
 * tablero (Willy, 06/10: «un análisis de consumo de productos»).
 *
 * Un GET que solo lee. Pide sesión como cualquier Server Action —es una URL
 * que se puede escribir a mano— y la consulta va con el cliente de la sesión,
 * así que además manda RLS. Los filtros los lee `opcionesDetalleDeUrl`, el
 * mismo que el PDF (26/11).
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const leido = await opcionesDetalleDeUrl(new URL(req.url));
  if (!leido.ok) return leido.respuesta;

  try {
    const { libro } = await libroDetalle(leido.opciones);
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // filename* para que las tildes y la ñ del cliente lleguen enteras.
        "Content-Disposition": `attachment; filename="detalle.xlsx"; filename*=UTF-8''${encodeURIComponent(leido.archivo("xlsx"))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
