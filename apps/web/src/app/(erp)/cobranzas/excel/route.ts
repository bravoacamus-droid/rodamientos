import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { libroCobranzas } from "@/modules/cobranzas/api/excel";

/**
 * El estado de todas las facturas en Excel (Willy, 03/11). Un GET que solo
 * lee, con la puerta de Cobranzas. Con `?cliente=` sale solo el suyo; un
 * cliente que no es un uuid se ignora en vez de viajar a la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("cobranzas", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const pedido = new URL(req.url).searchParams.get("cliente");
  const cliente = pedido && UUID.test(pedido) ? pedido : undefined;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  try {
    const libro = await libroCobranzas({ cliente }, hoy);
    const nombre = `Estado de facturas al ${hoy.split("-").reverse().join("-")}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="estado-de-facturas.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
