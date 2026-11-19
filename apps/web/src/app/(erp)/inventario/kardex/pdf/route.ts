import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { leerFiltrosKardex, pdfKardex } from "@/modules/inventario/exportar";

/** El kardex en PDF, con los filtros de la pantalla (19/11). Igual que el Excel. */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("almacen", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const filtros = leerFiltrosKardex(new URL(req.url).searchParams);
  try {
    const { pdf, archivo } = await pdfKardex(filtros);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // «inline»: se abre en la pestaña y desde ahí se guarda o se imprime.
        "Content-Disposition": `inline; filename="kardex.pdf"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el PDF: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
