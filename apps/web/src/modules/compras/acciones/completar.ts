"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import type { Json } from "@rodatech/db/tipos";

/**
 * Completar una orden del pedido con la factura del proveedor (128).
 *
 * La orden ya existe —salió de la cotización con su proveedor, sus
 * cantidades y el costo del análisis—; aquí se le pone lo que trae el papel:
 * cómo llegó, n.° y moneda de la factura, IGV, gastos y lo que de verdad
 * cobró por cada producto. Las cantidades no viajan: son las del pedido.
 *
 * Mismos roles que registrar una compra; la base vuelve a comprobarlo.
 */


const esquema = z.object({
  compra_id: z.string().uuid(),
  tipo: z.enum(["local", "importacion"]),
  via_importacion: z.enum(["aerea", "maritima"]).nullable().default(null),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  fecha_estimada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  documento_proveedor: z.string().trim().min(1, "Falta el número de la factura del proveedor.").max(60),
  guia_proveedor: z.string().max(60).nullable().default(null),
  afecto_igv: z.boolean(),
  moneda: z.enum(["USD", "PEN"]),
  tipo_cambio: z.number().positive().finite().nullable().default(null),
  tracking: z.string().max(80).nullable().default(null),
  courier: z.string().max(60).nullable().default(null),
  observaciones: z.string().max(2000).nullable().default(null),
  gastos: z
    .array(
      z.object({
        concepto: z.string().trim().min(1).max(80),
        monto: z.number().positive().finite(),
        reparto: z.enum(["valor", "peso"]).default("valor"),
      }),
    )
    .max(20)
    .default([]),
  items: z
    .array(
      z.object({
        producto_id: z.string().uuid(),
        costo_unitario: z.number().nonnegative().finite(),
        peso_kg: z.number().nonnegative().finite().max(5000).default(0),
      }),
    )
    .min(1)
    .max(500),
});

export type ResultadoCompletar = { ok: true; id: string; numero: string } | { ok: false; error: string };

export async function completarCompra(_previo: ResultadoCompletar | null, formData: FormData): Promise<ResultadoCompletar> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const prohibido = await sinPermiso("compras", "editar");
  if (prohibido) {
    return { ok: false, error: prohibido };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(String(formData.get("compra") ?? "")));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}` };
  }
  if (datos.moneda !== "USD" && !datos.tipo_cambio) {
    return { ok: false, error: "Falta el tipo de cambio: una factura en soles necesita el dólar de ese día." };
  }

  const { compra_id, ...resto } = datos;
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("completar_compra", {
      p_id: compra_id,
      p_datos: resto as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };
    const r = data as unknown as { id: string; numero: string };

    revalidatePath("/compras");
    revalidatePath(`/compras/${r.id}`);
    revalidatePath("/compras/pedido", "layout");
    revalidatePath("/recepciones/nueva");
    return { ok: true, id: r.id, numero: r.numero };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la factura." };
  }
}
