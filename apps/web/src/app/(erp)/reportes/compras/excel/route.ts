import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { libroCompras } from "@/modules/tablero/api/excel-compras";
import { opcionesComprasDeUrl } from "@/modules/tablero/api/compras-url";

/** El Excel del reporte de compras (133), con los filtros de la pantalla. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const leido = await opcionesComprasDeUrl(new URL(req.url));
  if (!leido.ok) return leido.respuesta;

  try {
    const libro = await libroCompras(leido.opciones);
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="compras.xlsx"; filename*=UTF-8''${encodeURIComponent(leido.archivo("xlsx"))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
