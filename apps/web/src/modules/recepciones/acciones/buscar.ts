"use server";

import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

import type { ProductoParaRecibir } from "../dominio/constructor";

/**
 * Búsqueda de catálogo mientras se registra la recepción.
 *
 * Es una lectura, así que por la convención de módulos viviría en `api/`. Está
 * aquí porque la invoca el navegador en tiempo real, y eso solo se puede hacer
 * con `"use server"`. Mismo motivo que en el constructor de cotizaciones: el
 * cliente de Supabase de navegador metería ~90 kB en el bundle de cualquiera
 * que abra el ERP.
 */

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

export interface ProductoRecepcionable extends ProductoParaRecibir {
  codigo_fabricante: string | null;
  estado_stock: "sin_stock" | "bajo" | "ok";
}

/**
 * Caja única de búsqueda del registro de recepción.
 *
 * A diferencia del cotizador, aquí NO se filtra por stock: lo que se está
 * recibiendo es justo lo que no hay. Un `p_solo_con_stock` en true escondería
 * exactamente los productos que se están reponiendo.
 */
export async function buscarParaRecibir(
  termino: string,
): Promise<Resultado<ProductoRecepcionable[]>> {
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
    return { ok: true, datos: (data ?? []) as unknown as ProductoRecepcionable[] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar el catálogo.",
    };
  }
}
