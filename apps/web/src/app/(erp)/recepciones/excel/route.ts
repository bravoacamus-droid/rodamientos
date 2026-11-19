import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { excelRecepciones } from "@/modules/recepciones/api/exportar";
import { leerFiltrosRecepciones } from "@/modules/recepciones/dominio/filtros";

/**
 * Las recepciones en Excel, con los filtros de la lista (19/11). Un GET que
 * solo lee: pide sesión y «Ver» en Almacén, y la consulta va con el cliente
 * de la sesión, así que además manda RLS.
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("almacen", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const { libro, archivo } = await excelRecepciones(leerFiltrosRecepciones(new URL(req.url).searchParams));
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="recepciones.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
