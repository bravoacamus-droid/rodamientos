import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { describirRango, leerRango } from "@/modules/reportes";

import type { TipoDetalle } from "./excel";

/**
 * Los filtros del detalle (ventas o cotizaciones), leídos de la URL (26/11).
 *
 * Los leen el Excel y el PDF, y tienen que leer lo mismo que la pantalla:
 * una fecha rara cae al valor por defecto y un cliente que no es un uuid se
 * ignora, en vez de viajar a la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OpcionesDetalle {
  tipo: TipoDetalle;
  desde: string;
  hasta: string;
  cliente: string | null;
  nombreCliente: string | null;
  descripcionRango: string;
  estado: string | null;
  serie: string | null;
}

export async function opcionesDetalleDeUrl(
  url: URL,
): Promise<{ ok: true; opciones: OpcionesDetalle; archivo: (ext: string) => string } | { ok: false; respuesta: Response }> {
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const tipo: TipoDetalle = p("tipo") === "cotizaciones" ? "cotizaciones" : "ventas";
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  const rango = leerRango(
    { desde: p("desde"), hasta: p("hasta"), atajo: p("atajo") ?? (p("desde") ? undefined : "12_meses") },
    hoy,
  );
  // Desde la lista de cotizaciones llegan también el estado y la serie (14/10).
  const estado = /^[a-z_]{3,20}$/.test(p("estado") ?? "") ? p("estado")! : null;
  const serie = /^[A-Z0-9]{2,6}$/.test(p("serie") ?? "") ? p("serie")! : null;
  const clienteParam = p("cliente");
  const cliente = clienteParam && UUID.test(clienteParam) ? clienteParam : null;

  let nombreCliente: string | null = null;
  if (cliente) {
    const supabase = await clienteServidor();
    const { data } = await supabase.from("clientes").select("razon_social").eq("id", cliente).maybeSingle();
    nombreCliente = data?.razon_social ?? null;
    // Sin esto, el archivo saldría vacío y diciendo «todos los clientes».
    if (!nombreCliente) return { ok: false, respuesta: new Response("Ese cliente no existe.", { status: 404 }) };
  }

  const quien = nombreCliente ? ` ${nombreCliente.replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 40)}` : "";
  return {
    ok: true,
    opciones: {
      tipo,
      desde: rango.desde,
      hasta: rango.hasta,
      cliente,
      nombreCliente,
      descripcionRango: describirRango(rango, hoy),
      estado,
      serie,
    },
    archivo: (ext) =>
      `${tipo === "ventas" ? "Ventas" : "Cotizaciones"} detalle${quien} ${rango.desde} a ${rango.hasta}.${ext}`,
  };
}
