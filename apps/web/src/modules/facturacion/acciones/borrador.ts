"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * La factura en borrador (176).
 *
 * Willy, 31/10: dejarla guardada *«para que lo mire antes, no vaya a ser»*,
 * como la guía. Se guarda lo llenado en la pantalla de emitir, tal cual; al
 * emitir viaja por el camino de siempre y el borrador se borra (lo hace
 * `emitirComprobante`). Aquí no se calcula ningún importe: el `total` es
 * para la lista, y el de verdad lo pone la base al emitir.
 */

/** Lo que la pantalla de emitir guarda: `DatosEmision` de `emisor.tsx`. */
const esquemaDatos = z.object({
  cotizacionId: z.string().uuid(),
  tipo: z.enum(["factura", "boleta"]),
  condicion: z.enum(["contado", "credito"]),
  dias: z.number().int().min(0).max(365),
  observaciones: z.string().max(2000),
  ordenCompra: z.string().max(60),
  cantidades: z.array(z.number().min(0)).max(200),
  opciones: z.object({
    mostrarCuenta: z.boolean(),
    enviarSunat: z.boolean(),
    retencion: z.boolean(),
    guias: z.array(z.string().uuid()).max(50),
  }),
  eleccion: z.enum(["con", "sin"]).nullable().optional(),
});

const esquema = z.object({
  /** Si ya existe, se actualiza; si no, se crea. */
  id: z.string().uuid().nullable(),
  datos: esquemaDatos,
  total: z.number().min(0).finite(),
  moneda: z.enum(["USD", "PEN"]),
});

export type DatosBorradorFactura = z.infer<typeof esquemaDatos>;

export type ResultadoBorrador = { ok: true; id: string } | { ok: false; error: string };

export async function guardarBorradorFactura(crudo: unknown): Promise<ResultadoBorrador> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("facturacion", "crear");
  if (negado) return { ok: false, error: negado };

  const r = esquema.safeParse(crudo);
  if (!r.success) return { ok: false, error: `Los datos no son válidos: ${r.error.issues[0]?.message ?? "formato"}.` };
  const { id, datos, total, moneda } = r.data;

  try {
    const supabase = await clienteServidor();
    // El cliente sale de la cotización, no del navegador.
    const { data: cot, error: errorCot } = await supabase
      .from("cotizaciones")
      .select("id, cliente_id")
      .eq("id", datos.cotizacionId)
      .maybeSingle();
    if (errorCot) return { ok: false, error: errorCot.message };
    if (!cot?.cliente_id) return { ok: false, error: "Esa cotización ya no existe." };

    const fila = {
      cotizacion_id: cot.id,
      cliente_id: cot.cliente_id,
      total,
      moneda,
      datos,
      actualizado_en: new Date().toISOString(),
    };
    if (id) {
      const { data, error } = await supabase.from("facturas_borrador").update(fila).eq("id", id).select("id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Ese borrador ya no existe: se emitió o se borró." };
    } else {
      const { data, error } = await supabase.from("facturas_borrador").insert(fila).select("id").single();
      if (error) return { ok: false, error: error.message };
      revalidatePath("/facturacion");
      return { ok: true, id: String(data.id) };
    }
    revalidatePath("/facturacion");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el borrador." };
  }
}

export async function borrarBorradorFactura(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("facturacion", "crear");
  if (negado) return { ok: false, error: negado };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Ese borrador no vale." };
  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("facturas_borrador").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/facturacion");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo borrar el borrador." };
  }
}
