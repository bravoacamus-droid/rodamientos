"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import type { Json } from "@rodatech/db/tipos";

import { anotarFallo } from "@/lib/errores";

import { analisisParaElegir, analisisParaHoja, historialDeProducto, referenciasDeProductos } from "../api/hoja-precios";

/**
 * La hoja de precios (07/10): guardarla entera, y traerle un análisis.
 *
 * Toda Server Action es un endpoint público: se valida el rol y los datos
 * aunque la pantalla ya lo haya hecho, y la base (110) lo vuelve a validar.
 */


async function puede(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  const prohibido = await sinPermiso("compras", "crear");
  if (prohibido) return prohibido;
  return null;
}

const uuid = z.string().uuid();

const esquema = z.object({
  consulta_id: uuid.nullable(),
  nota: z.string().max(500).nullable(),
  items: z
    .array(
      z.object({
        producto_id: uuid,
        cantidad: z.number().int("Las cantidades se piden enteras.").positive().finite(),
      }),
    )
    .min(1, "Añade al menos un producto.")
    .max(200),
  proveedores: z
    .array(
      z.object({
        proveedor_id: uuid,
        moneda: z.enum(["USD", "PEN"]),
        tipo_cambio: z.number().positive().finite().nullable(),
        incluye_igv: z.boolean(),
        precios: z
          .array(
            z.object({
              producto_id: uuid,
              costo_unitario: z.number().nonnegative().finite().nullable(),
              disponible: z.boolean(),
              cantidad_disponible: z.number().int().positive().finite().nullable(),
            }),
          )
          .max(200),
      }),
    )
    .max(20, "Como mucho veinte proveedores en una hoja."),
});

export type ResultadoGuardar = { ok: true; id: string; numero: string } | { ok: false; error: string };

export async function guardarHojaPrecios(datosCrudos: unknown): Promise<ResultadoGuardar> {
  const error = await puede();
  if (error) return { ok: false, error };

  const r = esquema.safeParse(datosCrudos);
  if (!r.success) return { ok: false, error: `Los datos no son válidos: ${r.error.issues[0]?.message}` };
  const datos = r.data;

  // Mismo mensaje que al anotar una respuesta: sin tipo de cambio un precio en
  // soles no se compara con uno en dólares.
  if (datos.proveedores.some((p) => p.moneda === "PEN" && !p.tipo_cambio)) {
    return { ok: false, error: "Hay un proveedor en soles sin tipo de cambio." };
  }
  // Un precio con «no tiene» a la vez no existe: la base lo rechazaría con un
  // mensaje que no ayuda.
  if (datos.proveedores.some((p) => p.precios.some((c) => c.disponible && c.costo_unitario === null))) {
    return { ok: false, error: "Hay una casilla marcada como que lo tiene, pero sin precio." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error: e } = await supabase.rpc("guardar_hoja_precios", { p_datos: datos as unknown as Json });
    if (e) {
      anotarFallo("compras/guardarHojaPrecios", e, "/compras/precios");
      return { ok: false, error: e.message };
    }
    const res = data as { id: string; numero: string };
    revalidatePath("/compras/precios");
    revalidatePath(`/compras/precios/${res.id}`);
    return { ok: true, id: res.id, numero: res.numero };
  } catch (e) {
    anotarFallo("compras/guardarHojaPrecios", e, "/compras/precios");
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la hoja." };
  }
}

/** Los análisis que se pueden traer a la hoja. */
export async function listaDeAnalisis() {
  const error = await puede();
  if (error) return { ok: false as const, error };
  return analisisParaElegir();
}

/** Un análisis, convertido en filas de la hoja con su PU LIMA. */
export async function traerAnalisis(id: string) {
  const error = await puede();
  if (error) return { ok: false as const, error };
  if (!uuid.safeParse(id).success) return { ok: false as const, error: "Ese análisis no vale." };
  return analisisParaHoja(id);
}

/** Precio de venta y último costo de productos recién añadidos a la hoja. */
export async function referenciasParaHoja(ids: string[]) {
  const error = await puede();
  if (error) return { ok: false as const, error };
  const validos = ids.filter((i) => uuid.safeParse(i).success).slice(0, 200);
  const m = await referenciasDeProductos(validos);
  return { ok: true as const, datos: Object.fromEntries(m) };
}

/** Lo cotizado, lo comprado y lo vendido de un producto, con fecha. */
export async function historialParaHoja(productoId: string) {
  const error = await puede();
  if (error) return { ok: false as const, error };
  if (!uuid.safeParse(productoId).success) return { ok: false as const, error: "Ese producto no vale." };
  return historialDeProducto(productoId);
}

/** Los datos de un proveedor que la hoja necesita y el buscador no trae. */
export async function datosDeProveedor(id: string) {
  const error = await puede();
  if (error) return { ok: false as const, error };
  if (!uuid.safeParse(id).success) return { ok: false as const, error: "Ese proveedor no vale." };
  const supabase = await clienteServidor();
  const { data } = await supabase.from("proveedores").select("id, razon_social, tipo").eq("id", id).maybeSingle();
  if (!data) return { ok: false as const, error: "Ese proveedor ya no existe." };
  return {
    ok: true as const,
    datos: {
      proveedorId: String(data.id),
      nombre: String(data.razon_social),
      tipo: (data.tipo === "importacion" ? "importacion" : "local") as "local" | "importacion",
    },
  };
}
