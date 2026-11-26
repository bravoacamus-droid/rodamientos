import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { excelClientes } from "@/modules/clientes/api/exportar";
import { leerFiltrosClientes, lectorDe } from "@/modules/clientes/dominio/filtros";

/**
 * La cartera en Excel, con los filtros de la lista (26/11). Un GET que solo
 * lee: pide sesión y «Ver» en Clientes, y la consulta va con el cliente de la
 * sesión, así que además manda RLS.
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("clientes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  try {
    const filtros = leerFiltrosClientes(lectorDe(new URL(req.url).searchParams));
    const { libro, archivo } = await excelClientes(filtros);
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clientes.xlsx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
