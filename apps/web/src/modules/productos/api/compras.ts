import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

/**
 * A quién se le compró este producto, cuándo, a cuánto y con qué factura.
 *
 * Willy, 07/09 (29:47): *«tengo que tener un módulo para hacer la consulta: yo
 * digito el código y me debe aparecer el historial de compras. Le compré a A,
 * anteriormente lo compré a B, luego lo compré a C»*.
 *
 * ---------------------------------------------------------------------------
 * Compras, no cotizaciones
 * ---------------------------------------------------------------------------
 * Sale de `v_precios_compra`, que se alimenta de RECEPCIONES: lo que de verdad
 * entró al almacén y se pagó. No de `v_comparativa_precios`, que es lo que los
 * proveedores dijeron que costaría.
 *
 * La diferencia importa justo al negociar. Un precio que ya se pagó es una
 * factura; uno que solo se cotizó es una promesa, y el proveedor lo sabe.
 */

export interface CompraDeProducto {
  recepcionId: string;
  /** El número de la recepción nuestra, para poder abrirla. */
  documento: string;
  fecha: string;
  proveedor: string | null;
  cantidad: number;
  costoUsd: number;
  /** Lo que costó la vez ANTERIOR, para decir si subió o bajó. */
  costoAnteriorUsd: number | null;
  /** Los dos papeles que se buscan cuando hay una discusión. */
  facturaProveedor: string | null;
  guiaProveedor: string | null;
}

export async function comprasDelProducto(
  productoId: string,
  limite = 12,
): Promise<{ ok: true; datos: CompraDeProducto[] } | { ok: false; error: string }> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_precios_compra")
      .select(
        "recepcion_id, documento, fecha, proveedor, cantidad, costo_usd, costo_anterior_usd, factura_proveedor, guia_proveedor",
      )
      .eq("producto_id", productoId)
      // La más reciente primero: es la que dice a cuánto está hoy.
      .order("fecha", { ascending: false })
      .limit(limite);

    if (error) return fallo(error, "productos/comprasDelProducto");

    return {
      ok: true,
      datos: (data ?? []).map((f) => ({
        recepcionId: String(f.recepcion_id),
        documento: String(f.documento ?? ""),
        fecha: String(f.fecha),
        proveedor: (f.proveedor as string | null) ?? null,
        cantidad: Number(f.cantidad ?? 0),
        costoUsd: Number(f.costo_usd ?? 0),
        costoAnteriorUsd:
          f.costo_anterior_usd === null ? null : Number(f.costo_anterior_usd),
        facturaProveedor: (f.factura_proveedor as string | null) ?? null,
        guiaProveedor: (f.guia_proveedor as string | null) ?? null,
      })),
    };
  } catch (e) {
    return fallo(e, "productos/comprasDelProducto");
  }
}
