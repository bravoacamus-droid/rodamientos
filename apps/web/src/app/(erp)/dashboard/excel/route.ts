import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { describirRango, leerRango } from "@/modules/reportes";
import { libroDetalle, type TipoDetalle } from "@/modules/tablero/api/excel";

/**
 * El detalle de ventas o de cotizaciones en Excel, con los filtros del
 * tablero (Willy, 06/10: «un análisis de consumo de productos»).
 *
 * Un GET que solo lee. Pide sesión como cualquier Server Action —es una URL
 * que se puede escribir a mano— y la consulta va con el cliente de la sesión,
 * así que además manda RLS. Los filtros se validan igual que en la pantalla:
 * una fecha rara cae al valor por defecto y un cliente que no es un uuid se
 * ignora, en vez de viajar a la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return new Response("Hay que iniciar sesión.", { status: 401 });

  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const tipo: TipoDetalle = p("tipo") === "cotizaciones" ? "cotizaciones" : "ventas";
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const rango = leerRango(
    { desde: p("desde"), hasta: p("hasta"), atajo: p("atajo") ?? (p("desde") ? undefined : "12_meses") },
    hoy,
  );
  const clienteParam = p("cliente");
  const cliente = clienteParam && UUID.test(clienteParam) ? clienteParam : null;

  let nombreCliente: string | null = null;
  if (cliente) {
    const supabase = await clienteServidor();
    const { data } = await supabase.from("clientes").select("razon_social").eq("id", cliente).maybeSingle();
    nombreCliente = data?.razon_social ?? null;
    // Sin esto, el Excel saldría vacío y diciendo «todos los clientes».
    if (!nombreCliente) return new Response("Ese cliente no existe.", { status: 404 });
  }

  try {
    const { libro } = await libroDetalle({
      tipo,
      desde: rango.desde,
      hasta: rango.hasta,
      cliente,
      nombreCliente,
      descripcionRango: describirRango(rango, hoy),
    });

    const quien = nombreCliente ? ` ${nombreCliente.replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 40)}` : "";
    const nombre = `${tipo === "ventas" ? "Ventas" : "Cotizaciones"} detalle${quien} ${rango.desde} a ${rango.hasta}.xlsx`;
    return new Response(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // filename* para que las tildes y la ñ del cliente lleguen enteras.
        "Content-Disposition": `attachment; filename="detalle.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudo armar el Excel: ${e instanceof Error ? e.message : "error"}`, { status: 500 });
  }
}
