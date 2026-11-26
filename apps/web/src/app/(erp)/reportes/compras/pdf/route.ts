import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { pdfCompras } from "@/modules/tablero/api/excel-compras";
import { opcionesComprasDeUrl } from "@/modules/tablero/api/compras-url";

/** El reporte de compras en PDF, con los filtros de la pantalla (26/11). Igual que el Excel. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const leido = await opcionesComprasDeUrl(new URL(req.url));
  if (!leido.ok) return leido.respuesta;

  try {
    const pdf = await pdfCompras(leido.opciones);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="compras.pdf"; filename*=UTF-8''${encodeURIComponent(leido.archivo("pdf"))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
