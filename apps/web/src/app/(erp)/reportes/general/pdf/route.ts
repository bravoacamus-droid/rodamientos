import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { pdfInforme } from "@/modules/reportes/api/exportar-informe";

/** El Informe general en PDF, con el periodo de la pantalla (26/11). */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("informe", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const { pdf, archivo } = await pdfInforme(new URL(req.url));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="informe-general.pdf"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
