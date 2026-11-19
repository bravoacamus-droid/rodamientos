import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { excelKardex, leerFiltrosKardex } from "@/modules/inventario/exportar";

/**
 * El kardex en Excel, con los filtros de la pantalla (19/11).
 *
 * Un GET que solo lee, como el de Productos: pide sesión y «Ver» en Almacén
 * —es una URL que se puede escribir a mano— y la consulta va con el cliente
 * de la sesión, así que además manda RLS.
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("almacen", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const filtros = leerFiltrosKardex(new URL(req.url).searchParams);
  try {
    const { libro, archivo } = await excelKardex(filtros);
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // filename* para que las tildes y la ñ lleguen enteras.
        "Content-Disposition": `attachment; filename="kardex.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
