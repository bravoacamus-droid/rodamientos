import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type { Resultado } from "./consultas";

/** Una fila del listado de análisis. */
export interface AnalisisLista {
  id: string;
  numero: string;
  fecha: string;
  proveedor: string;
  referencia: string | null;
  estado: "borrador" | "comprado";
  compra_id: string | null;
  compra_numero: string | null;
  lineas: number;
  costo_envio: number;
}

/** Un análisis entero, para editarlo o convertirlo en compra. */
export interface AnalisisDetalle {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string;
  referencia: string | null;
  costo_envio: number;
  peso_declarado: number | null;
  notas: string | null;
  desaduanaje_soles: number;
  tipo_cambio: number | null;
  estado: "borrador" | "comprado";
  compra_id: string | null;
  compra_numero: string | null;
  items: {
    producto_id: string | null;
    codigo: string;
    marca: string | null;
    descripcion: string | null;
    cantidad_ref: number;
    cantidad_pedido: number;
    precio_fob: number;
    peso_kg: number;
    precio_mercado: number;
    proveedor_mercado: string | null;
    frecuencia: number | null;
    cliente: string | null;
  }[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function listarAnalisis(): Promise<Resultado<AnalisisLista[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("analisis_importacion")
      .select(
        `id, numero, fecha, referencia, estado, compra_id, costo_envio,
         proveedores(razon_social),
         compra:compras(numero),
         analisis_importacion_items(count)`,
      )
      .order("creado_en", { ascending: false })
      .limit(100);
    if (error) return fallo(error, "compras/listarAnalisis");

    type Fila = {
      id: string;
      numero: string;
      fecha: string;
      referencia: string | null;
      estado: string;
      compra_id: string | null;
      costo_envio: number;
      proveedores: { razon_social: string } | null;
      compra: { numero: string } | null;
      analisis_importacion_items: { count: number }[];
    };
    return {
      ok: true,
      datos: ((data ?? []) as unknown as Fila[]).map((f) => ({
        id: f.id,
        numero: f.numero,
        fecha: f.fecha,
        proveedor: f.proveedores?.razon_social ?? "—",
        referencia: f.referencia,
        estado: f.estado === "comprado" ? "comprado" : "borrador",
        compra_id: f.compra_id,
        compra_numero: f.compra?.numero ?? null,
        lineas: f.analisis_importacion_items?.[0]?.count ?? 0,
        costo_envio: n(f.costo_envio),
      })),
    };
  } catch (e) {
    return fallo(e, "compras/listarAnalisis");
  }
}

export async function analisisPorId(id: string): Promise<Resultado<AnalisisDetalle | null>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: true, datos: null };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("analisis_importacion")
      .select(
        `id, numero, fecha, proveedor_id, referencia, costo_envio, peso_declarado,
         notas, estado, compra_id, desaduanaje_soles, tipo_cambio,
         compra:compras(numero),
         analisis_importacion_items(
           orden, producto_id, codigo, marca, descripcion, cantidad_ref,
           cantidad_pedido, precio_fob, peso_kg, precio_mercado,
           proveedor_mercado, frecuencia, cliente
         )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return fallo(error, "compras/analisisPorId");
    if (!data) return { ok: true, datos: null };

    const f = data as unknown as Record<string, unknown> & {
      compra: { numero: string } | null;
      analisis_importacion_items: (Record<string, unknown> & { orden: number })[];
    };
    return {
      ok: true,
      datos: {
        id: String(f.id),
        numero: String(f.numero),
        fecha: String(f.fecha),
        proveedor_id: String(f.proveedor_id),
        referencia: (f.referencia as string | null) ?? null,
        costo_envio: n(f.costo_envio),
        peso_declarado: f.peso_declarado === null ? null : n(f.peso_declarado),
        notas: (f.notas as string | null) ?? null,
        desaduanaje_soles: n(f.desaduanaje_soles),
        tipo_cambio: f.tipo_cambio === null || f.tipo_cambio === undefined ? null : n(f.tipo_cambio),
        estado: f.estado === "comprado" ? "comprado" : "borrador",
        compra_id: (f.compra_id as string | null) ?? null,
        compra_numero: f.compra?.numero ?? null,
        items: [...(f.analisis_importacion_items ?? [])]
          .sort((a, b) => a.orden - b.orden)
          .map((i) => ({
            producto_id: (i.producto_id as string | null) ?? null,
            codigo: String(i.codigo),
            marca: (i.marca as string | null) ?? null,
            descripcion: (i.descripcion as string | null) ?? null,
            cantidad_ref: n(i.cantidad_ref),
            cantidad_pedido: n(i.cantidad_pedido),
            precio_fob: n(i.precio_fob),
            peso_kg: n(i.peso_kg),
            precio_mercado: n(i.precio_mercado),
            proveedor_mercado: (i.proveedor_mercado as string | null) ?? null,
            frecuencia: i.frecuencia === null ? null : n(i.frecuencia),
            cliente: (i.cliente as string | null) ?? null,
          })),
      },
    };
  } catch (e) {
    return fallo(e, "compras/analisisPorId");
  }
}
