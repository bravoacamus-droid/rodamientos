import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { excelInforme } from "@/modules/reportes/api/exportar-informe";

/** El Informe general en Excel, con el periodo de la pantalla (26/11). */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  // El mismo permiso que la pantalla: «Informe general · Ver» (143).
  const prohibido = await sinPermiso("informe", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const { libro, archivo } = await excelInforme(new URL(req.url));
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="informe-general.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
