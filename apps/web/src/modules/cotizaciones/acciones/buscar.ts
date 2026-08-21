"use server";

import { z } from "zod";
import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

import type { ProductoParaCotizar } from "../dominio/constructor";

/**
 * Consultas que el constructor dispara MIENTRAS se cotiza.
 *
 * Son lecturas, así que por la convención de módulos vivirían en `api/`. Están
 * aquí porque las invoca el navegador en tiempo real, y eso solo se puede
 * hacer con `"use server"`.
 *
 * La alternativa era usar el cliente de Supabase del navegador. Se descartó:
 * mete `supabase-js` en el bundle, que son cerca de 90 kB que pagaría cualquiera
 * que abra el ERP. Es la misma razón por la que el login se pasó a Server
 * Actions y bajó de 280 kB a 118 kB.
 */

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

const fallo = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "No se pudo consultar.",
});

/** Toda acción es un endpoint público: sin sesión no se responde. */
async function haySesion(): Promise<boolean> {
  return (await usuarioActual()) !== null;
}

const uuid = z.string().uuid();

export interface ProductoBusqueda extends ProductoParaCotizar {
  codigo_fabricante: string | null;
  familia: string | null;
  subfamilia: string | null;
  tipo: string | null;
  estado_stock: "sin_stock" | "bajo" | "ok";
}

/** Caja única de búsqueda del constructor. */
export async function buscarParaCotizar(
  termino: string,
  soloConStock = false,
): Promise<Resultado<ProductoBusqueda[]>> {
  if (!(await haySesion())) return { ok: false, error: "Sesión expirada." };

  const q = termino.trim();
  // Con menos de dos caracteres el trigrama no discrimina y devolvería medio
  // catálogo. Mejor no consultar que consultar en vano.
  if (q.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_productos", {
      p_q: q,
      p_limit: 20,
      p_solo_con_stock: soloConStock,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: (data ?? []) as unknown as ProductoBusqueda[] };
  } catch (e) {
    return fallo(e);
  }
}

export interface Sustituto extends ProductoParaCotizar {
  diferencia_pct: number;
  origen: "equivalencia" | "misma_medida" | "tipo" | "subfamilia";
  prioridad: number;
  mejor_oferta: boolean;
}

/**
 * Alternativas para una línea sin stock (49:56).
 *
 * La cascada la resuelve `sustitutos_de()`: equivalencia capturada a mano →
 * misma medida en otra marca → mismo tipo → misma subfamilia.
 */
export async function sustitutosPara(
  productoId: string,
): Promise<Resultado<Sustituto[]>> {
  if (!(await haySesion())) return { ok: false, error: "Sesión expirada." };
  if (!uuid.safeParse(productoId).success) {
    return { ok: false, error: "Producto no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("sustitutos_de", {
      p_producto: productoId,
      p_limit: 8,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: (data ?? []) as unknown as Sustituto[] };
  } catch (e) {
    return fallo(e);
  }
}

export interface VentaAnterior {
  fecha: string;
  documento: string;
  cliente: string;
  cantidad: number;
  valor_unitario: number;
  mismo_cliente: boolean;
}

/**
 * A cuánto se vendió antes, con lo de ESTE cliente primero.
 *
 * Sin esto el vendedor le cotiza más caro que la vez pasada sin darse cuenta,
 * y el cliente sí se da cuenta.
 */
export async function historialDe(
  productoId: string,
  clienteId: string | null,
): Promise<Resultado<VentaAnterior[]>> {
  if (!(await haySesion())) return { ok: false, error: "Sesión expirada." };
  if (!uuid.safeParse(productoId).success) {
    return { ok: false, error: "Producto no válido." };
  }
  const cliente = clienteId && uuid.safeParse(clienteId).success ? clienteId : null;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("historial_precio_producto", {
      p_producto: productoId,
      // undefined, no null: el parámetro del RPC es OPCIONAL y PostgREST omite
      // del cuerpo lo que llega como undefined, para que Postgres aplique su
      // DEFAULT. Un null explícito es un valor, no una ausencia.
      p_cliente: cliente ?? undefined,
      p_limit: 8,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: (data ?? []) as unknown as VentaAnterior[] };
  } catch (e) {
    return fallo(e);
  }
}
