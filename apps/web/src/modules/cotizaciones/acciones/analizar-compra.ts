"use server";

import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { historialDeProducto, referenciasDeProductos, type HistorialProducto, type Referencias } from "@/modules/compras/api/hoja-precios";

/**
 * Lo que hace falta para «Analizar precio de compra» de una línea (09/10).
 *
 * Toda Server Action es un endpoint público: rol primero. Son los roles que
 * cotizan, porque es quien cotiza el que llama al proveedor.
 */
const ROLES = ["gerencia", "admin", "ventas"] as const;

export interface DatosParaAnalizar {
  referencias: Referencias | null;
  /** Los que ya se lo vendieron, con su último costo: se añaden con un clic. */
  sugeridos: { id: string; nombre: string; ultimoCostoUsd: number | null; ultimaCompra: string | null }[];
  historial: HistorialProducto;
  /** El último tipo de cambio que se usó, para no escribirlo cada vez. */
  tipoCambio: number | null;
}

export async function datosParaAnalizar(
  productoId: string,
): Promise<{ ok: true; datos: DatosParaAnalizar } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede analizar precios." };
  }
  if (typeof productoId !== "string" || !/^[0-9a-f-]{36}$/i.test(productoId)) {
    return { ok: false, error: "El producto no es válido." };
  }

  try {
    const supabase = await clienteServidor();
    const [refs, historial, conocidos, tc] = await Promise.all([
      referenciasDeProductos([productoId]),
      historialDeProducto(productoId),
      supabase
        .from("proveedor_productos")
        .select("proveedor_id, ultimo_costo_usd, ultima_compra, proveedores!inner(razon_social, activo)")
        .eq("producto_id", productoId)
        .eq("proveedores.activo", true)
        .limit(20),
      supabase
        .from("compras")
        .select("tipo_cambio")
        .eq("moneda", "PEN")
        .not("tipo_cambio", "is", null)
        .order("fecha", { ascending: false })
        .limit(1),
    ]);
    if (!historial.ok) return historial;
    if (conocidos.error) return { ok: false, error: conocidos.error.message };

    const sugeridos = ((conocidos.data ?? []) as unknown as {
      proveedor_id: string;
      ultimo_costo_usd: number | null;
      ultima_compra: string | null;
      proveedores: { razon_social: string };
    }[])
      .map((p) => ({
        id: p.proveedor_id,
        nombre: p.proveedores.razon_social,
        ultimoCostoUsd: p.ultimo_costo_usd === null ? null : Number(p.ultimo_costo_usd),
        ultimaCompra: p.ultima_compra,
      }))
      .sort((a, b) => ((a.ultimaCompra ?? "") < (b.ultimaCompra ?? "") ? 1 : -1));

    const ultimoTc = Number((tc.data ?? [])[0]?.tipo_cambio);

    return {
      ok: true,
      datos: {
        referencias: refs.get(productoId) ?? null,
        sugeridos,
        historial: historial.datos,
        tipoCambio: Number.isFinite(ultimoTc) && ultimoTc > 0 ? ultimoTc : null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el producto." };
  }
}
