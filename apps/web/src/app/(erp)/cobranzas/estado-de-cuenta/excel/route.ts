import { perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import { emisorParaImprimir } from "@/lib/emisor";

import { clientesConFacturas, estadosDeCuenta, leerEleccionCuenta } from "@/modules/cobranzas/api/estado-cuenta";
import { libroEstadoCuenta } from "@/modules/cobranzas/api/excel-estado-cuenta";

/**
 * El estado de cuenta en Excel (03/11), con lo mismo que se eligió en la
 * pantalla: un cliente, varios o todos, y qué facturas salen. Un GET que solo
 * lee, con la puerta de Cobranzas.
 */
export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });
  const prohibido = await sinPermiso("cobranzas", "ver");
  if (prohibido) return new Response(prohibido, { status: 403 });

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const eleccion = leerEleccionCuenta(new URL(req.url).searchParams);

  try {
    const [clientes, emisor] = await Promise.all([clientesConFacturas(hoy), emisorParaImprimir()]);
    if (!clientes.ok) throw new Error(clientes.error);
    const r = await estadosDeCuenta(eleccion, clientes.datos, hoy);
    if (!r.ok) throw new Error(r.error);
    if (r.hojas.length === 0) return new Response("No hay ningún estado de cuenta con lo elegido.", { status: 404 });

    const libro = await libroEstadoCuenta(r.hojas, hoy, eleccion.periodo, emisor.razonSocial || "Rodatech");
    const fechaCorte = hoy.split("-").reverse().join("-");
    const nombre =
      r.hojas.length === 1
        ? `Estado de cuenta ${r.hojas[0]!.cliente.razonSocial} al ${fechaCorte}.xlsx`
        : `Estado de cuenta de ${r.hojas.length} clientes al ${fechaCorte}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="estado-de-cuenta.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre.replace(/[\/:*?"<>|]/g, " "))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
