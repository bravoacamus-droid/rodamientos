"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { type Accion, sinPermiso } from "@/lib/permisos";
import type { Json } from "@rodatech/db/tipos";

import { consultarTipoCambio } from "@/lib/tipo-cambio";

import { type PreviaEliminar, leerPrevia } from "../dominio/eliminar";

/**
 * Lo que le pasa a una cotización después de emitirla: aprobarla, rechazarla,
 * o clonarla para volver a cotizar.
 */

const uuid = z.string().uuid();

export type ResultadoGestion =
  | { ok: true; id?: string; numero?: string; pedidoId?: string }
  /** `pideTipoCambio`: es en soles y SUNAT no contestó; que lo escriban. */
  | { ok: false; error: string; pideTipoCambio?: boolean };

async function exigirPermiso(accion: Accion): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const negado = await sinPermiso("cotizaciones", accion);
  if (negado) {
    return negado;
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
  /** Solo si SUNAT no contestó y la cotización es en soles. */
  tipoCambioManual?: number,
): Promise<ResultadoGestion> {
  const problema = await exigirPermiso("editar");
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

    /*
      En soles, el cambio es el del DÍA DE LA COTIZACIÓN (119, Willy 14/10) y
      ya se fijó al pasarla a soles. Aquí solo se busca si falta: el venta de
      SUNAT de su fecha; si SUNAT no contesta, el que escriban.
    */
    let tipoCambio: number | null = null;
    const { data: cab, error: errorCab } = await supabase
      .from("cotizaciones")
      .select("moneda, tipo_cambio, fecha")
      .eq("id", id)
      .maybeSingle();
    if (errorCab) return { ok: false, error: errorCab.message };
    if (cab?.moneda === "PEN" && !(Number(cab.tipo_cambio) > 0)) {
      if (typeof tipoCambioManual === "number" && tipoCambioManual > 0 && tipoCambioManual < 100) {
        tipoCambio = tipoCambioManual;
      } else {
        const tc = await consultarTipoCambio(cab.fecha);
        if (!tc.ok) {
          return {
            ok: false,
            error: `Es una venta en soles y no se pudo traer el tipo de cambio de SUNAT (${tc.error}). Escríbelo a mano.`,
            pideTipoCambio: true,
          };
        }
        tipoCambio = tc.venta;
      }
    }

    const { error } = await supabase.rpc("aprobar_cotizacion", {
      p_id: id,
      p_lineas: detalle,
      ...(tipoCambio ? { p_tipo_cambio: tipoCambio } : {}),
    });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    revalidatePath("/pedidos");
    // El pedido que acaba de nacer (130), para llevar a él.
    const { data: ped } = await supabase
      .from("pedidos")
      .select("id")
      .eq("cotizacion_id", id)
      .order("secuencia", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: true, pedidoId: ped?.id ?? undefined };
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
  // Anular pide «eliminar», como en la pantalla de permisos; lo demás, «editar» (21/10).
  const problema = await exigirPermiso(estado === "anulada" ? "eliminar" : "editar");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  if (!DESTINOS.includes(estado)) return { ok: false, error: "Estado no permitido." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("cotizaciones")
      .update({ estado })
      .eq("id", id);
    /*
      El error de PostgREST llegaba tal cual a la pantalla (21/10). Lo
      probable es que la base la rechace por una regla del documento (079):
      ya tiene guía o factura.
    */
    if (error) {
      return {
        ok: false,
        error:
          error.code === "42501"
            ? "Tu rol no puede hacer esto con la cotización."
            : "No se pudo cambiar la cotización. Si ya tiene guía o factura, ya no se puede anular ni rechazar.",
      };
    }
    refrescar(id);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo cambiar la cotización. Vuelve a intentarlo en un momento." };
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
  const problema = await exigirPermiso("crear");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };

  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("cotizaciones")
      .select(
        `cliente_id, validez_dias, tiempo_entrega, contacto, condiciones,
         observaciones, mostrar_descuento,
         cotizacion_items(id, producto_id, orden, codigo, marca, descripcion,
                          cantidad, unidad_codigo, valor_unitario,
                          descuento_pct, costo_unitario, alternativa_de)`,
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

    const ordenadas = [...items].sort((a, b) => Number(a.orden) - Number(b.orden));
    // 169: la copia conserva qué línea es alternativa de cuál, por posición.
    const posicion = new Map(ordenadas.map((i, n) => [i.id as string, n + 1]));

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
      items: ordenadas.map((i, n) => {
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
            alternativa_de_orden: i.alternativa_de
              ? (posicion.get(i.alternativa_de as string) ?? null)
              : null,
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

/**
 * Corregir las cantidades de un pedido YA confirmado.
 *
 * Willy, 07/09 (15:58): *«una vez que ya fue aceptada la cotización, ¿ya no se
 * puede modificar?»* — *«mientras que no se facture se puede manejar»*. Y por
 * qué le importa: *«en sí la mayoría que va a cambiar es la cantidad»*.
 *
 * No es `aprobar` otra vez. Aprobar es pasar de «lo ofrecí» a «me lo
 * compraron», y eso ocurre una vez; la RPC lo exige y hace bien. Esto es lo de
 * después, con sus propios límites: nunca más de lo cotizado —eso sería una
 * venta nueva, con un precio que puede no ser el mismo— ni menos de lo que ya
 * salió con guía o ya se facturó. Los tres los comprueba `corregir_confirmado`
 * en la base, que es donde no se pueden saltar.
 */
export async function corregirConfirmado(
  id: string,
  lineas: { item_id: string; cantidad: number }[],
): Promise<ResultadoGestion> {
  const problema = await exigirPermiso("editar");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };

  const revision = z.array(esquemaLinea).min(1).max(200).safeParse(lineas);
  if (!revision.success) {
    return { ok: false, error: "Las cantidades no son válidas." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("corregir_confirmado", {
      p_id: id,
      p_lineas: revision.data,
    });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo corregir el pedido.",
    };
  }
}

/**
 * La orden de compra del cliente (112). Ya no va en el formulario de la
 * cotización —Luis, 09/10: *«eso es cuando ya tenemos una orden»*—, sino al
 * aprobar o desde la ficha, cuando llegue.
 */
export async function ponerOrdenCliente(id: string, oc: string): Promise<ResultadoGestion> {
  const problemaPermiso = await exigirPermiso("editar");
  if (problemaPermiso) return { ok: false, error: problemaPermiso };
  if (!uuid.safeParse(id).success) return { ok: false, error: "La cotización no es válida." };
  if (typeof oc !== "string" || oc.trim().length > 60) {
    return { ok: false, error: "La orden de compra no puede pasar de 60 caracteres." };
  }
  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.rpc("poner_orden_compra_cliente", { p_id: id, p_oc: oc.trim() });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/**
 * Dólares o soles (116). Willy cotiza casi todo en dólares; una venta en
 * soles lo es de punta a punta —cotización, factura y cobro—, y se elige
 * antes de aprobar: al aprobar se congela el tipo de cambio.
 */
export async function ponerMoneda(id: string, moneda: "USD" | "PEN"): Promise<ResultadoGestion> {
  const problema = await exigirPermiso("editar");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  if (moneda !== "USD" && moneda !== "PEN") return { ok: false, error: "Moneda no válida." };

  try {
    const supabase = await clienteServidor();
    /*
      En soles, el cambio del DÍA DE LA COTIZACIÓN, fijado ya (119). Willy,
      14/10: «tiene que mantener el mismo precio… ese tipo de cambio tiene que
      ser del día que se cotizó». Si SUNAT no contesta, se pide al aprobar.
    */
    let tipoCambio: number | null = null;
    if (moneda === "PEN") {
      const { data: cab } = await supabase.from("cotizaciones").select("fecha").eq("id", id).maybeSingle();
      const tc = await consultarTipoCambio(cab?.fecha);
      if (tc.ok) tipoCambio = tc.venta;
    }
    const { error } = await supabase.rpc("poner_moneda_cotizacion", {
      p_id: id,
      p_moneda: moneda,
      ...(tipoCambio ? { p_tipo_cambio: tipoCambio } : {}),
    });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cambiar la moneda." };
  }
}

/**
 * Otro pedido con la misma cotización (121). Willy, 14/10: el cliente
 * fidelizado le pide otra vez lo mismo y él saca la guía y la factura de la
 * misma cotización; salen con su propio número, colgando de ella.
 */
export async function repetirPedido(
  id: string,
  lineas: { item_id: string; cantidad: number }[],
): Promise<ResultadoGestion> {
  const problema = await exigirPermiso("crear");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  const revision = z.array(esquemaLinea).min(1).max(200).safeParse(lineas);
  if (!revision.success) return { ok: false, error: "Las cantidades del pedido no son válidas." };
  if (!revision.data.some((l) => l.cantidad > 0)) return { ok: false, error: "Pon al menos una cantidad." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("repetir_pedido", {
      p_id: id,
      p_lineas: revision.data as unknown as Json,
      // Sin O/C: la del pedido anterior se vacía y la nueva se pone en la guía (123).
    });
    if (error) return { ok: false, error: error.message };
    refrescar(id);
    revalidatePath("/guias");
    revalidatePath("/pedidos");
    const pedidoId = (data as { pedido_id?: string } | null)?.pedido_id;
    return { ok: true, id, ...(pedidoId ? { pedidoId } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar el pedido." };
  }
}

/**
 * Lo que el diálogo de «Eliminar cotización» enseña antes de confirmar (164):
 * si se puede, y qué pasa con su número. Pide el mismo permiso que eliminar.
 */
export async function previaEliminarCotizacion(
  id: string,
): Promise<{ ok: true; previa: PreviaEliminar } | { ok: false; error: string }> {
  const problema = await exigirPermiso("eliminar");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("previa_eliminar_cotizacion", { p_id: id });
    if (error) return { ok: false, error: error.message };
    const previa = leerPrevia(data);
    if (!previa) return { ok: false, error: "No se pudo leer la cotización." };
    return { ok: true, previa };
  } catch {
    return { ok: false, error: "No se pudo revisar la cotización. Vuelve a intentarlo en un momento." };
  }
}

/**
 * Eliminar una cotización (164). Luis, 27/10: *«ponte que elimino la
 * COT-010, la cotización que voy a crear tiene que ser la 010, no la 11»*.
 *
 * Las reglas viven en `eliminar_cotizacion`: nada colgando (pedido, guía,
 * comprobante, orden de compra) y, si era la última de su serie, el contador
 * vuelve atrás bajo candado.
 */
export async function eliminarCotizacion(
  id: string,
): Promise<{ ok: true; numero: string; ultima: boolean; siguiente: string | null } | { ok: false; error: string }> {
  const problema = await exigirPermiso("eliminar");
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Cotización no válida." };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("eliminar_cotizacion", { p_id: id });
    if (error) {
      return {
        ok: false,
        error: error.code === "42501" ? "Tu rol no puede eliminar cotizaciones." : error.message,
      };
    }
    const r = leerPrevia(data);
    if (!r) return { ok: false, error: "La cotización se eliminó, pero no se pudo leer su número." };
    revalidatePath("/cotizaciones");
    revalidatePath("/dashboard");
    revalidatePath("/alertas");
    return { ok: true, numero: r.numero, ultima: r.ultima, siguiente: r.siguiente };
  } catch {
    return { ok: false, error: "No se pudo eliminar la cotización. Vuelve a intentarlo en un momento." };
  }
}
