"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

import { parCanonico } from "../dominio/equivalencia";
import { CLASES, type ClaseEquivalencia } from "../dominio/tipos";

/**
 * Declarar y quitar equivalencias.
 *
 * `producto_equivalencias` no tiene RPC y no lo necesita: es un insert de
 * cuatro columnas sobre una tabla con RLS, y la política ya pregunta a
 * `permisos_rol`. Lo que sí hace falta es la parte que la base no puede
 * decidir sola —en qué SENTIDO se guarda el par— y eso vive en `parCanonico`.
 */

/** La misma lista que `permisos_rol` tiene para `producto_equivalencias`. */
const ROLES = ["gerencia", "admin", "ventas", "compras"] as const;

export type ResultadoEquivalencia =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

const uuid = z.string().uuid();

const esquema = z.object({
  producto_id: uuid,
  equivalente_id: uuid,
  clase: z.enum(CLASES as unknown as [ClaseEquivalencia, ...ClaseEquivalencia[]]),
  nota: z.string().max(500).nullable(),
});

async function perfilQuePuede(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false, error: "Hay que iniciar sesión." };
  }
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede declarar equivalencias." };
  }
  return { ok: true, id: perfil.id };
}

/**
 * Declara que dos productos son equivalentes.
 *
 * El par se guarda SIEMPRE en el mismo sentido (`parCanonico`). Sin eso, la
 * restricción `equiv_unica (producto_id, equivalente_id)` deja entrar A→B y
 * B→A, y como `sustitutos_de()` une los dos sentidos, el mismo producto
 * saldría dos veces en la lista.
 */
export async function declararEquivalencia(
  productoId: string,
  equivalenteId: string,
  clase: ClaseEquivalencia,
  nota: string | null,
): Promise<ResultadoEquivalencia> {
  const quien = await perfilQuePuede();
  if (!quien.ok) return quien;

  const datos = esquema.safeParse({
    producto_id: productoId,
    equivalente_id: equivalenteId,
    clase,
    nota: nota?.trim() ? nota.trim() : null,
  });
  if (!datos.success) {
    return {
      ok: false,
      error: `Los datos no son válidos: ${datos.error.issues[0]?.message ?? "formato inesperado"}.`,
    };
  }

  // Lo comprueba también `equiv_distinta` en la base; se adelanta aquí para
  // dar el motivo en lugar de un error de restricción.
  if (datos.data.producto_id === datos.data.equivalente_id) {
    return { ok: false, error: "Un producto no es equivalente de sí mismo." };
  }

  const [a, b] = parCanonico(datos.data.producto_id, datos.data.equivalente_id);

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("producto_equivalencias").insert({
      producto_id: a,
      equivalente_id: b,
      clase: datos.data.clase,
      nota: datos.data.nota,
      creado_por: quien.id,
    });

    if (error) {
      // 23505 = la restricción `equiv_unica`. Ya estaba declarada, y decirlo
      // así es más útil que enseñar el nombre del índice.
      if (error.code === "23505") {
        return { ok: false, error: "Esos dos productos ya estaban declarados equivalentes." };
      }
      return { ok: false, error: mensajeDeError(error) };
    }

    return revalidarY("Equivalencia declarada.");
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Quita una equivalencia declarada.
 *
 * Borra por el par en los dos sentidos y no por el id de la fila: si alguna
 * quedó guardada al revés de una carga anterior a `parCanonico`, esto la
 * encuentra igual.
 */
export async function quitarEquivalencia(
  productoId: string,
  equivalenteId: string,
): Promise<ResultadoEquivalencia> {
  const quien = await perfilQuePuede();
  if (!quien.ok) return quien;

  if (!uuid.safeParse(productoId).success || !uuid.safeParse(equivalenteId).success) {
    return { ok: false, error: "El producto no es válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error, count } = await supabase
      .from("producto_equivalencias")
      .delete({ count: "exact" })
      .or(
        `and(producto_id.eq.${productoId},equivalente_id.eq.${equivalenteId}),` +
          `and(producto_id.eq.${equivalenteId},equivalente_id.eq.${productoId})`,
      );

    if (error) return { ok: false, error: mensajeDeError(error) };
    if ((count ?? 0) === 0) {
      return { ok: false, error: "Esa equivalencia ya no estaba declarada." };
    }

    return revalidarY("Equivalencia quitada.");
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Buscar en el catálogo, para el selector de la pantalla.
 *
 * Es una lectura y por la convención de módulos viviría en `api/`. Está aquí
 * porque la dispara el navegador mientras se teclea, y eso solo se puede hacer
 * con `"use server"` — el mismo motivo que en `cotizaciones/acciones/buscar`.
 */
export async function buscarEnCatalogo(termino: string) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false as const, error: "Sesión expirada." };
  }

  const q = termino.trim();
  // Con menos de dos caracteres el trigrama no discrimina y devolvería medio
  // catálogo.
  if (q.length < 2) return { ok: true as const, datos: [] };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("buscar_productos", {
      p_q: q,
      p_limit: 20,
      p_solo_con_stock: false,
    });
    if (error) return { ok: false as const, error: mensajeDeError(error) };

    const filas = (data ?? []) as unknown as Array<{
      id: string;
      codigo: string;
      descripcion: string;
      marca: string | null;
      unidad: string | null;
      stock: number | null;
      precio_venta: number | null;
    }>;

    // `buscar_productos` NO devuelve `stock_minimo` —devuelve `estado_stock`
    // ya calculado—, así que el buscador no puede pintar el aviso de «bajo
    // mínimo». Aquí da igual: se está eligiendo qué producto mirar, no si hay
    // suficiente para despachar.
    return {
      ok: true as const,
      datos: filas.map((p) => ({
        id: p.id,
        sku: p.codigo,
        descripcion: p.descripcion,
        marca: p.marca,
        unidad: p.unidad,
        stock: p.stock,
        precio: p.precio_venta,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: mensajeDeError(e) };
  }
}

function revalidarY(mensaje: string): ResultadoEquivalencia {
  revalidatePath("/equivalencias");
  // La ficha del producto también enseña equivalentes.
  revalidatePath("/productos", "layout");
  return { ok: true, mensaje };
}
