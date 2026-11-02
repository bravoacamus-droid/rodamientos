"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";
import { sinPermiso } from "@/lib/permisos";

/**
 * Guardar la orden de compra editada (180).
 *
 * Willy, 02/11: *«cada orden de compra es como una cotización: que se pueda
 * editar también los precios de costo… y poner condición de pago… y
 * dirección de entrega»*. Todo lo hace `actualizar_orden_compra` en la base,
 * que comprueba que la orden siga sin factura ni recepción y recalcula los
 * totales; aquí se valida la forma, porque esto es un endpoint público.
 */

const esquema = z
  .object({
    id: z.string().uuid(),
    condicion_pago: z.enum(["contado", "credito"]).nullable(),
    dias_credito: z.number().int().min(1).max(365).nullable(),
    entrega: z.enum(["almacen", "recojo"]).nullable(),
    direccion_entrega: z.string().trim().max(300).nullable(),
    fecha_estimada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    observaciones: z.string().trim().max(2000).nullable(),
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          cantidad: z.number().positive("Cada producto necesita una cantidad mayor que cero.").max(1_000_000),
          costo_unitario: z.number().min(0, "El costo no puede ser negativo.").max(10_000_000),
        }),
      )
      .min(1, "La orden tiene que quedar con al menos un producto.")
      .max(300),
  })
  .refine((d) => d.condicion_pago !== "credito" || d.dias_credito !== null, {
    message: "A crédito, di a cuántos días es la factura.",
  });

export type ResultadoEditarOrden = { ok: true; numero: string } | { ok: false; error: string };

export async function editarOrdenCompra(crudo: unknown): Promise<ResultadoEditarOrden> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("compras", "editar");
  if (negado) return { ok: false, error: negado };

  const r = esquema.safeParse(crudo);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Los datos no son válidos." };
  const { id, ...datos } = r.data;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("actualizar_orden_compra", {
      p_id: id,
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/compras/${id}`);
    revalidatePath("/compras");
    return { ok: true, numero: String((data as { numero?: string } | null)?.numero ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la orden." };
  }
}
