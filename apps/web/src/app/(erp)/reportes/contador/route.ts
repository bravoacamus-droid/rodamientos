import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { libroContador } from "@/modules/reportes/api/contador";
import { nombreMes, rangoDeMes } from "@/modules/reportes/dominio/contador";

/**
 * El Excel del mes para el contador (23/10): ventas y compras en soles.
 *
 * Un GET que solo lee, con la misma puerta que el resto de reportes. Un mes
 * mal escrito cae al mes en curso en vez de viajar a la base.
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("reportes", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const pedido = new URL(req.url).searchParams.get("mes");
  const mes = rangoDeMes(pedido) ? pedido! : hoy.slice(0, 7);
  const rango = rangoDeMes(mes)!;

  try {
    const libro = await libroContador(mes, rango.desde, rango.hasta);
    const nombre = `Para el contador ${nombreMes(mes)}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contador.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
