"use server";

import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

/**
 * Contra qué se compara el costo con el que llega la mercadería.
 *
 * Es el paso 7 del plan de compras. Willy, 01/09: *«sería bueno poner el
 * último precio que compra, así con el precio anterior haiga historial y
 * mejorar los precios»*.
 *
 * Vive en `acciones/` y no en `api/` por lo mismo que `costosDelProveedor` de
 * compras: la compra se elige a mitad del registro, en el navegador, y hasta
 * ese momento no se sabe qué productos van a llegar.
 */

export interface Referencia {
  producto_id: string;
  /** Lo que costó la vez anterior, en dólares. Null si es la primera. */
  costoAnteriorUsd: number | null;
  /** De qué documento salió, para poder decirlo. */
  documento: string | null;
  precioVenta: number;
  /** El piso que Willy fijó producto a producto. 0 = no lo puso. */
  precioMinimo: number;
}

export type ResultadoReferencias =
  | { ok: true; datos: Record<string, Referencia> }
  | { ok: false; error: string };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function referenciasDeProductos(
  productoIds: string[],
): Promise<ResultadoReferencias> {
  if ((await usuarioActual()) === null) {
    return { ok: false, error: "Sesión expirada." };
  }
  if (productoIds.length === 0) return { ok: true, datos: {} };

  try {
    const supabase = await clienteServidor();
    const ids = productoIds.slice(0, 150);

    // Los precios del maestro y el histórico de compra van en dos consultas
    // porque salen de sitios distintos: uno es la ficha del producto y el otro
    // es `v_precios_compra` (042), que ya trae los costos convertidos a
    // dólares. Compararlos en su moneda original daría comparaciones falsas
    // entre una compra en soles y otra en dólares.
    const [maestro, historial] = await Promise.all([
      supabase.from("productos").select("id, precio_venta, precio_minimo").in("id", ids),
      supabase
        .from("v_precios_compra")
        .select("producto_id, documento, fecha, costo_usd")
        .in("producto_id", ids)
        .order("fecha", { ascending: false })
        .order("documento", { ascending: false })
        .limit(500),
    ]);

    if (maestro.error) return { ok: false, error: maestro.error.message };

    const datos: Record<string, Referencia> = {};
    for (const p of maestro.data ?? []) {
      datos[String(p.id)] = {
        producto_id: String(p.id),
        costoAnteriorUsd: null,
        documento: null,
        precioVenta: num(p.precio_venta),
        precioMinimo: num(p.precio_minimo),
      };
    }

    // El histórico llega de más nuevo a más viejo, así que la PRIMERA vez que
    // se ve un producto es su última compra. Por eso no se sobrescribe.
    for (const h of (historial.data ?? []) as unknown as {
      producto_id: string;
      documento: string | null;
      costo_usd: number | string | null;
    }[]) {
      const ref = datos[h.producto_id];
      if (!ref || ref.costoAnteriorUsd !== null) continue;
      const costo = num(h.costo_usd);
      if (costo <= 0) continue;
      ref.costoAnteriorUsd = costo;
      ref.documento = h.documento;
    }

    return { ok: true, datos };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el histórico.",
    };
  }
}
