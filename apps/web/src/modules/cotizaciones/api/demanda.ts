import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import type { DemandaProducto, PedidoDelProducto } from "../dominio/demanda";

/**
 * Quién más pide estos productos (09/10). Ver `dominio/demanda.ts`.
 *
 * Tres lecturas para todos los productos a la vez: lo aprobado pendiente
 * (`v_comprometido`), lo cotizado sin confirmar y lo que viene en camino
 * (`v_pedido_pendiente`).
 */
export async function demandaDeProductos(ids: readonly string[]): Promise<Map<string, DemandaProducto>> {
  const unicos = [...new Set(ids)].slice(0, 200);
  const salida = new Map<string, DemandaProducto>();
  if (unicos.length === 0) return salida;
  for (const id of unicos) salida.set(id, { productoId: id, aprobadas: [], sinConfirmar: [], stock: 0, enCamino: 0 });

  const supabase = await clienteServidor();
  const [aprobadas, cotizadas, enCamino, stock] = await Promise.all([
    supabase
      .from("v_comprometido")
      .select("producto_id, cotizacion_id, cotizacion, fecha, cliente, comprometido")
      .in("producto_id", unicos)
      .limit(1000),
    supabase
      .from("cotizacion_items")
      .select("producto_id, cantidad, cotizaciones!inner(id, numero, fecha, estado, validez_dias, clientes(razon_social))")
      .in("producto_id", unicos)
      .in("cotizaciones.estado", ["borrador", "enviada"])
      .limit(1000),
    supabase.from("v_pedido_pendiente").select("producto_id, pendiente").in("producto_id", unicos),
    supabase.from("stock").select("producto_id, cantidad").in("producto_id", unicos),
  ]);

  for (const f of aprobadas.data ?? []) {
    const d = salida.get(String(f.producto_id));
    if (!d || !f.cotizacion_id) continue;
    d.aprobadas.push({
      cotizacionId: f.cotizacion_id,
      numero: String(f.cotizacion),
      cliente: String(f.cliente),
      fecha: String(f.fecha),
      cantidad: Number(f.comprometido),
      estado: "aprobada",
    });
  }

  // Las vencidas no: una cotización que el cliente ya no puede aceptar no
  // está pidiendo nada.
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
  for (const f of (cotizadas.data ?? []) as unknown as {
    producto_id: string;
    cantidad: number;
    cotizaciones: {
      id: string;
      numero: string;
      fecha: string;
      estado: PedidoDelProducto["estado"];
      validez_dias: number;
      clientes: { razon_social: string } | null;
    };
  }[]) {
    const d = salida.get(f.producto_id);
    if (!d) continue;
    const c = f.cotizaciones;
    const vence = new Date(`${c.fecha}T12:00:00`);
    vence.setDate(vence.getDate() + Number(c.validez_dias || 0));
    if (vence.toISOString().slice(0, 10) < hoy) continue;
    d.sinConfirmar.push({
      cotizacionId: c.id,
      numero: c.numero,
      cliente: c.clientes?.razon_social ?? "—",
      fecha: c.fecha,
      cantidad: Number(f.cantidad),
      estado: c.estado,
    });
  }

  for (const f of enCamino.data ?? []) {
    const d = salida.get(String(f.producto_id));
    if (d) d.enCamino = Number(f.pendiente) || 0;
  }
  for (const f of stock.data ?? []) {
    const d = salida.get(String(f.producto_id));
    if (d) d.stock = Math.max(0, Number(f.cantidad) || 0);
  }

  for (const d of salida.values()) {
    d.aprobadas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    d.sinConfirmar.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }
  return salida;
}
