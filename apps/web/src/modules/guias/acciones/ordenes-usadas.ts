"use server";

import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { distintas } from "../dominio/ordenes";

/**
 * Las órdenes de compra que ya usó un cliente, para sugerirlas (14/10).
 *
 * De la cotización, de sus guías y de sus facturas: es el mismo número el que
 * viaja por los tres documentos, y una O/C puede ir en varias guías —la
 * segunda guía de un pedido lleva la de la primera—. Las recientes primero.
 *
 * Solo lectura y bajo RLS: lo que el rol no puede ver, no sale.
 */
export async function ordenesUsadas(clienteId: string): Promise<string[]> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return [];
  if (typeof clienteId !== "string" || !/^[0-9a-f-]{36}$/i.test(clienteId)) return [];

  try {
    const supabase = await clienteServidor();
    const [cot, gui, fac] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select("orden_compra_cliente, creado_en")
        .eq("cliente_id", clienteId)
        .not("orden_compra_cliente", "is", null)
        .order("creado_en", { ascending: false })
        .limit(30),
      supabase
        .from("guias_remision")
        .select("orden_compra_cliente, creado_en")
        .eq("cliente_id", clienteId)
        .not("orden_compra_cliente", "is", null)
        .order("creado_en", { ascending: false })
        .limit(30),
      supabase
        .from("comprobantes")
        .select("orden_compra_cliente, creado_en")
        .eq("cliente_id", clienteId)
        .not("orden_compra_cliente", "is", null)
        .order("creado_en", { ascending: false })
        .limit(30),
    ]);

    const filas = [...(cot.data ?? []), ...(gui.data ?? []), ...(fac.data ?? [])].sort((a, b) =>
      String(b.creado_en).localeCompare(String(a.creado_en)),
    );
    return distintas(filas.map((f) => f.orden_compra_cliente)).slice(0, 20);
  } catch {
    // Son sugerencias: sin ellas se escribe igual.
    return [];
  }
}
