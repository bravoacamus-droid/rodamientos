"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Genera la guía en BORRADOR desde una cotización aprobada.
 *
 * Borrador y no emitida, siempre. Emitir es un segundo paso porque es el que
 * **saca el stock del almacén**, y Willy pidió vista previa antes (§2.2): la
 * guía se prepara cuando se cierra la venta y se completa cuando el camión ya
 * tiene placa y conductor. La base hace la misma distinción con
 * `guia_transporte_ok`, que solo exige los datos del transporte cuando la guía
 * deja de ser borrador.
 */

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

const esquemaItem = z.object({
  producto_id: z.string().uuid(),
  cotizacion_item_id: z.string().uuid().nullable(),
  codigo: z.string().max(60),
  descripcion: z.string().max(500),
  cantidad: z.number().positive().finite(),
  unidad_codigo: z.string().min(1).max(10),
  peso_kg: z.number().nonnegative().finite(),
});

const esquema = z.object({
  cotizacion_id: z.string().uuid(),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_traslado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de traslado no es válida."),
  motivo_codigo: z.string().length(2),
  direccion_llegada: z.string().min(1, "Falta la dirección de entrega.").max(300),
  ubigeo_llegada: z.string().regex(/^\d{6}$/).nullable(),
  peso_bruto_kg: z.number().positive("El peso bruto tiene que ser mayor que cero."),
  numero_bultos: z.number().int().positive(),
  modalidad_traslado: z.enum(["01", "02"]),
  transportista_documento: z.string().max(15).nullable(),
  transportista_razon_social: z.string().max(200).nullable(),
  transportista_placa: z.string().max(15).nullable(),
  conductor_documento: z.string().max(15).nullable(),
  conductor_nombre: z.string().max(200).nullable(),
  conductor_licencia: z.string().max(20).nullable(),
  entregado_por: z.string().max(200).nullable(),
  observaciones: z.string().max(2000).nullable(),
  estado: z.literal("borrador"),
  items: z.array(esquemaItem).min(1, "La guía no tiene productos.").max(500),
});

export type ResultadoGuia =
  | { ok: true; id: string; numero: string; pesoBrutoKg: number }
  | { ok: false; error: string };

export async function generarGuia(
  _previo: ResultadoGuia | null,
  formData: FormData,
): Promise<ResultadoGuia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede generar guías de remisión." };
  }

  const crudo = formData.get("guia");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la guía." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // Dos líneas del mismo producto se suman en la pantalla; esto cubre a quien
  // llame sin pasar por ella.
  const productos = new Set(datos.items.map((i) => i.producto_id));
  if (productos.size !== datos.items.length) {
    return {
      ok: false,
      error: "Hay un producto repetido en dos líneas. Únelas en una sola.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("generar_guia_desde_cotizacion", {
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as {
      id: string;
      numero: string;
      peso_bruto_kg: number;
    };

    revalidatePath("/guias");
    revalidatePath("/cotizaciones");
    revalidatePath(`/cotizaciones/${datos.cotizacion_id}`);
    // OJO: aquí NO se revalida el catálogo ni el inventario. El borrador no
    // mueve stock — lo mueve `emitir_guia`.

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      pesoBrutoKg: Number(r.peso_bruto_kg ?? 0),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo generar la guía.",
    };
  }
}
