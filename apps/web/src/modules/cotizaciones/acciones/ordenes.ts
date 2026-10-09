"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Las órdenes de compra de una cotización confirmada (111): una por
 * proveedor, todas o ninguna. La base comprueba que cada producto sea de
 * esta cotización y que no se le pida dos veces lo mismo al mismo proveedor.
 */
const ROLES = ["gerencia", "admin", "compras"] as const;

const esquema = z.object({
  cotizacion_id: z.string().uuid(),
  ordenes: z
    .array(
      z
        .object({
          proveedor_id: z.string().uuid(),
          moneda: z.enum(["USD", "PEN"]),
          tipo_cambio: z.number().positive().max(100).nullable(),
          items: z
            .array(
              z.object({
                producto_id: z.string().uuid(),
                // Enteras: Luis, 21/09.
                cantidad: z.number().int("Las cantidades se piden enteras.").positive(),
                costo_unitario: z.number().nonnegative().finite(),
                unidad_codigo: z.string().min(1).max(10),
              }),
            )
            .min(1)
            .max(200),
        })
        .refine((o) => o.moneda === "USD" || o.tipo_cambio !== null, {
          message: "Una orden en soles necesita el tipo de cambio.",
        }),
    )
    .min(1, "No hay nada que comprar.")
    .max(30),
});

export async function generarOrdenesDeCompra(
  datosCrudos: unknown,
): Promise<{ ok: true; ordenes: { id: string; numero: string }[] } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede generar órdenes de compra." };
  }

  const datos = esquema.safeParse(datosCrudos);
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("generar_ordenes_de_compra", {
      p_datos: datos.data as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/cotizaciones/${datos.data.cotizacion_id}`);
    revalidatePath("/compras");
    const r = data as unknown as { ordenes: { id: string; numero: string }[] };
    return { ok: true, ordenes: r.ordenes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudieron generar las órdenes." };
  }
}
