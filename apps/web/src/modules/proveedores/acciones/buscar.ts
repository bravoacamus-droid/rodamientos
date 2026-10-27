"use server";

import { z } from "zod";
import { clienteServidor, usuarioActual } from "@rodatech/db/servidor";

import type { ProveedorOpcion } from "../dominio/opcion";

/**
 * La caja de búsqueda del selector de proveedor.
 *
 * Es una LECTURA, así que por la convención de módulos viviría en `api/`. Está
 * aquí por lo mismo que `cotizaciones/acciones/buscar.ts`: la invoca el
 * navegador mientras se teclea, y eso solo se puede hacer con `"use server"`.
 * La alternativa —el cliente de Supabase en el navegador— mete 90 kB de
 * `supabase-js` en el bundle de cualquiera que abra el ERP.
 *
 * Va contra `buscar_proveedores` (033) y no contra un `.like()` de PostgREST
 * porque lo que hace falta no es filtrar sino ORDENAR, y porque PostgREST no
 * sabe buscar por marca: eso es un `join` con `proveedor_marcas` que ningún
 * filtro de URL puede expresar.
 *
 * Vive en el módulo `proveedores` y no dentro de compras o de recepciones —que
 * son las dos pantallas que la usan— por la misma razón que
 * `proveedoresParaSelector`: para que añadir un criterio se haga en un sitio y
 * no en dos que se separan con el tiempo.
 */

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Toda acción es un endpoint público: sin sesión no se responde. */
async function haySesion(): Promise<boolean> {
  return (await usuarioActual()) !== null;
}

export interface ContactoProveedor {
  id: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
}

/**
 * El teléfono, el WhatsApp y el correo de unos proveedores ya elegidos.
 *
 * «Analizar precio de compra» propone proveedores desde lo cotizado y lo
 * comprado, que llegan con el nombre y el precio pero sin el número
 * (auditoría 27/10). Willy los llama desde esa pantalla, así que el número
 * tiene que estar ahí. Lectura sin más: el maestro de proveedores lo ve
 * cualquiera con sesión.
 */
export async function contactoDeProveedores(
  ids: unknown,
): Promise<Resultado<ContactoProveedor[]>> {
  if (!(await haySesion())) return { ok: false, error: "Sesión expirada." };
  const valido = z.array(z.string().uuid()).max(50).safeParse(ids);
  if (!valido.success) return { ok: false, error: "Proveedores no válidos." };
  if (valido.data.length === 0) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("proveedores")
      .select("id, telefono, whatsapp, email")
      .in("id", valido.data);
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar.",
    };
  }
}

export async function buscarProveedores(
  termino: string,
): Promise<Resultado<ProveedorOpcion[]>> {
  if (!(await haySesion())) return { ok: false, error: "Sesión expirada." };

  const q = termino.trim();
  // Con una letra el trigrama no discrimina y devolvería el maestro entero.
  // Mejor no consultar que consultar en vano.
  if (q.length < 2) return { ok: true, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_proveedores", {
      p_q: q,
      p_limit: 20,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, datos: (data ?? []) as unknown as ProveedorOpcion[] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo consultar.",
    };
  }
}
