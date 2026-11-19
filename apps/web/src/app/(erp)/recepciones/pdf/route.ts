import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { pdfRecepciones } from "@/modules/recepciones/api/exportar";
import { leerFiltrosRecepciones } from "@/modules/recepciones/dominio/filtros";

/** Las recepciones en PDF, con los filtros de la lista (19/11). Igual que el Excel. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("almacen", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const { pdf, archivo } = await pdfRecepciones(leerFiltrosRecepciones(new URL(req.url).searchParams));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="recepciones.pdf"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
