import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { pdfDetalle } from "@/modules/tablero/api/excel";
import { opcionesDetalleDeUrl } from "@/modules/tablero/api/detalle-url";

/** El detalle de ventas o cotizaciones en PDF, con los filtros del reporte (26/11). Igual que el Excel. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const leido = await opcionesDetalleDeUrl(new URL(req.url));
  if (!leido.ok) return leido.respuesta;

  try {
    const { pdf } = await pdfDetalle(leido.opciones);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="detalle.pdf"; filename*=UTF-8''${encodeURIComponent(leido.archivo("pdf"))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
