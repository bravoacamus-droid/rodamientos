"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Lo que le pasa a una cotización después de emitirla: aprobarla, rechazarla,
 * o clonarla para volver a cotizar.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;
const uuid = z.string().uuid();

export type ResultadoGestion =
  | { ok: true; id?: string; numero?: string }
  | { ok: false; error: string };

async function exigirPermiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede gestionar cotizaciones.";
  }
  return null;
}

function refrescar(id: string) {
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  revalidatePath("/dashboard");
}

/**
 * Lo que el cliente confirmó de una línea.
 *
 * Se manda la lista SOLO cuando confirmó una parte. Sin lista, la RPC aprueba
 * todas las líneas por su cantidad cotizada, que es lo que pasa casi siempre.
 */
const esquemaLinea = z.object({
  item_id: z.string().uuid(),
  cantidad: z.number().nonnegative().finite(),
});

/**
 * Aprobar: es el paso que habilita facturar y generar la guía.
 *
 * Willy, 01/09 (29:05): *«me están confirmando el total o parte de lo
 * cotizado»*. Por eso admite el detalle — y por eso lo admite OPCIONAL: pedir
 * que enumere seis líneas para decir «me confirmaron las seis» sería trabajo
 * inventado en el caso que ocurre casi siempre.
 */
export async function aprobar(
  id: string,
  lineas?: { item_id: string; cantidad: number }[],
): Promise<ResultadoGestion> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };

  let detalle: { item_id: string; cantidad: number }[] | null = null;
  if (lineas !== undefined) {
    const revision = z.array(esquemaLinea).min(1).max(200).safeParse(lineas);
    if (!revision.success) {
      return { ok: false, error: "Las cantidades confirmadas no son válidas." };
    }
    // Las que quedaron en cero se mandan igual: la RPC parte de cero y sube lo
    // que llega, así que da lo mismo — pero mandarlas deja constancia de que
    // se miraron y se descartaron, en vez de que se olvidaran.
    detalle = revision.data;
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("aprobar_cotizacion", {
      p_id: id,
      p_lineas: detalle,
    });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo aprobar." };
  }
}

/**
 * Cambio de estado directo, para lo que no tiene RPC propia.
 *
 * La lista de destinos es cerrada a propósito: sin ella, esta acción sería un
 * `update` de estado arbitrario expuesto en un endpoint público.
 */
const DESTINOS = ["enviada", "rechazada", "anulada"] as const;

export async function cambiarEstado(
  id: string,
  estado: (typeof DESTINOS)[number],
): Promise<ResultadoGestion> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  if (!DESTINOS.includes(estado)) return { ok: false, error: "Estado no permitido." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("cotizaciones")
      .update({ estado })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar." };
  }
}

/**
 * Clonar.
 *
 * Se copian las LÍNEAS pero no los precios negociados: se vuelve al valor
 * vigente del maestro. Una cotización de hace tres meses arrastraba el precio
 * de hace tres meses, y clonar era la forma más silenciosa de vender al costo
 * de entonces. El descuento sí se conserva, porque es una decisión comercial
 * sobre ese cliente y no un dato que caduque.
 *
 * La nueva nace en borrador, así que todavía se puede revisar antes de mandarla.
 */
export async function clonar(id: string): Promise<ResultadoGestion> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };

  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("cotizaciones")
      .select(
        `cliente_id, validez_dias, tiempo_entrega, contacto, condiciones,
         observaciones, mostrar_descuento,
         cotizacion_items(producto_id, orden, codigo, marca, descripcion,
                          cantidad, unidad_codigo, valor_unitario,
                          descuento_pct, costo_unitario)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "La cotización no existe." };

    const items = (data.cotizacion_items ?? []) as Record<string, unknown>[];
    if (items.length === 0) {
      return { ok: false, error: "La cotización no tiene líneas que copiar." };
    }

    // Precios vigentes del maestro para las líneas que apuntan a un producto.
    const ids = items
      .map((i) => i.producto_id as string | null)
      .filter((x): x is string => x !== null);

    const vigentes = new Map<string, { precio_venta: number; costo_promedio: number }>();
    if (ids.length > 0) {
      const { data: productos, error: e2 } = await supabase
        .from("productos")
        .select("id, precio_venta, costo_promedio")
        .in("id", ids);
      if (e2) return { ok: false, error: e2.message };
      for (const p of productos ?? []) {
        vigentes.set(p.id, {
          precio_venta: p.precio_venta,
          costo_promedio: p.costo_promedio,
        });
      }
    }

    const payload = {
      cliente_id: data.cliente_id,
      validez_dias: data.validez_dias,
      tiempo_entrega: data.tiempo_entrega,
      // La orden de compra NO se copia: es de la operación anterior.
      orden_compra_cliente: null,
      contacto: data.contacto,
      condiciones: data.condiciones,
      observaciones: data.observaciones,
      mostrar_descuento: data.mostrar_descuento,
      estado: "borrador",
      items: [...items]
        .sort((a, b) => Number(a.orden) - Number(b.orden))
        .map((i, n) => {
          const pid = i.producto_id as string | null;
          const vigente = pid ? vigentes.get(pid) : undefined;
          return {
            producto_id: pid,
            orden: n + 1,
            codigo: i.codigo,
            marca: i.marca,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            unidad_codigo: i.unidad_codigo,
            valor_unitario: vigente?.precio_venta ?? i.valor_unitario,
            descuento_pct: i.descuento_pct,
            costo_unitario: vigente?.costo_promedio ?? i.costo_unitario,
          };
        }),
    };

    const { data: creada, error: e3 } = await supabase.rpc("crear_cotizacion", {
      p_datos: payload as unknown as Json,
    });
    if (e3) return { ok: false, error: e3.message };

    const r = creada as unknown as { id: string; numero: string };
    revalidatePath("/cotizaciones");
    revalidatePath("/dashboard");
    return { ok: true, id: r.id, numero: r.numero };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo clonar." };
  }
}
