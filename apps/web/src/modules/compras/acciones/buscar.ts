"use server";

import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

import type { ProductoParaComprar } from "../dominio/constructor";

/**
 * Búsqueda de catálogo mientras se registra la compra.
 *
 * Es una lectura, así que por la convención de módulos viviría en `api/`. Está
 * aquí porque la invoca el navegador en tiempo real, y eso solo se puede hacer
 * con `"use server"`. Mismo motivo que en cotizaciones y recepciones: el
 * cliente de Supabase de navegador metería ~90 kB en el bundle de cualquiera
 * que abra el ERP.
 */

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export interface ProductoComprable extends ProductoParaComprar {
  codigo_fabricante: string | null;
  estado_stock: "sin_stock" | "bajo" | "ok";
  /** El de referencia en Lima (098), para el análisis de importación. */
  precio_mercado?: number;
}

/**
 * Caja única de búsqueda del registro de compra.
 *
 * NO se filtra por stock: lo que se compra es justo lo que falta. Un
 * `p_solo_con_stock` en true escondería exactamente los productos que se están
 * reponiendo, que es el mismo criterio que en recepciones.
 */
export async function buscarParaComprar(
  termino: string,
): Promise<Resultado<ProductoComprable[]>> {
  if ((await usuarioActual()) === null) {
    return { ok: false, error: "Sesión expirada." };
  }

  const q = termino.trim();
  // Con menos de dos caracteres el trigrama no discrimina y devolvería medio
  // catálogo. Mejor no consultar que consultar en vano.
  if (q.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_productos", {
      p_q: q,
      p_limit: 20,
      p_solo_con_stock: false,
    });
    if (error) return { ok: false, error: error.message };
    const datos = (data ?? []) as unknown as ProductoComprable[];

    /*
      El PESO, en una segunda lectura (097).

      Una importación aérea reparte el courier por kilo —es como lo calcula
      Willy (§AP)—, así que la compra necesita el peso de cada producto. Se
      pide aquí y no en `buscar_productos` porque cambiar lo que devuelve esa
      función obliga a borrarla y recrearla, y la usan cotizaciones, compras y
      kits. Una consulta más por los ≤ 20 resultados no se nota.
    */
    if (datos.length > 0) {
      // Y el precio de mercado (098): el análisis de importación lo propone al
      // añadir, y hasta el 02/10 llegaba siempre vacío porque nadie lo leía.
      const { data: pesos } = await supabase
        .from("productos")
        .select("id, peso_kg, precio_mercado")
        .in(
          "id",
          datos.map((p) => p.id),
        );
      const porId = new Map((pesos ?? []).map((p) => [p.id, p]));
      for (const p of datos) {
        const extra = porId.get(p.id);
        p.peso_kg = Number(extra?.peso_kg) || 0;
        p.precio_mercado = Number(extra?.precio_mercado) || 0;
      }
    }
    return { ok: true, datos };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el catálogo.",
    };
  }
}
