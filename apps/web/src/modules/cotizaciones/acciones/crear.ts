"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

import { lineasBajoPiso } from "../dominio/piso";

/**
 * Alta de cotización.
 *
 * Toda la cabecera y las N líneas van en UNA llamada a `crear_cotizacion()`.
 * En la demo, emitir un documento de 20 ítems eran 20 viajes secuenciales al
 * servidor; era el problema de rendimiento más caro que tenía.
 */

const ROLES = ["gerencia", "admin", "ventas"] as const;

const esquemaItem = z.object({
  producto_id: z.string().uuid().nullable(),
  orden: z.number().int().positive(),
  codigo: z.string().min(1).max(60),
  marca: z.string().max(80).nullable(),
  descripcion: z.string().min(1).max(300),
  cantidad: z.number().positive().finite(),
  unidad_codigo: z.string().min(2).max(4),
  valor_unitario: z.number().nonnegative().finite(),
  descuento_pct: z.number().min(0).max(100),
  costo_unitario: z.number().nonnegative().finite(),
});

const esquema = z.object({
  cliente_id: z.string().uuid(),
  validez_dias: z.number().int().min(1).max(365),
  tiempo_entrega: z.string().max(120).nullable(),
  orden_compra_cliente: z.string().max(60).nullable(),
  contacto: z.string().max(160).nullable(),
  condiciones: z.string().max(1000).nullable(),
  observaciones: z.string().max(2000).nullable(),
  mostrar_descuento: z.boolean(),
  items: z.array(esquemaItem).min(1).max(200),
});

export type ResultadoCreacion =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

export async function crearCotizacion(
  _previo: ResultadoCreacion | null,
  formData: FormData,
): Promise<ResultadoCreacion> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false, error: "Hay que iniciar sesión." };
  }
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede emitir cotizaciones." };
  }

  const crudo = formData.get("cotizacion");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la cotización." };
  }

  // Una Server Action es un endpoint público: la entrada es hostil hasta que
  // se demuestre lo contrario, venga de nuestra pantalla o no.
  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle =
      e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // El piso ya se validó en pantalla, y la base lo hace cumplir con un check.
  // Se vuelve a mirar aquí porque una acción también se puede llamar sin pasar
  // por la pantalla, y porque el error del check no es legible para nadie.
  //
  // Los pisos se leen del MAESTRO, no del payload: aceptarlos de quien llama
  // sería regalar la regla.
  const conProducto = datos.items.filter((i) => i.producto_id !== null);
  if (conProducto.length > 0) {
    const supabase = await clienteServidor();
    const { data: pisos, error } = await supabase
      .from("productos")
      .select("id, codigo, precio_minimo")
      .in("id", conProducto.map((i) => i.producto_id as string));

    if (error) return { ok: false, error: error.message };

    const porId = new Map((pisos ?? []).map((p) => [p.id, p]));
    const bajas = lineasBajoPiso(
      conProducto.map((i) => ({
        cantidad: i.cantidad,
        valorUnitario: i.valor_unitario,
        descuentoPct: i.descuento_pct,
        precioMinimo: porId.get(i.producto_id as string)?.precio_minimo ?? 0,
      })),
    );

    if (bajas.length > 0) {
      const codigos = bajas
        .map((b) => conProducto[b.indice]?.codigo)
        .filter(Boolean)
        .join(", ");
      return {
        ok: false,
        error: `Por debajo del precio mínimo: ${codigos}. Sube el precio o quita el descuento.`,
      };
    }
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_cotizacion", {
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { id: string; numero: string };
    revalidatePath("/cotizaciones");
    revalidatePath("/dashboard");
    return { ok: true, id: r.id, numero: r.numero };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la cotización.",
    };
  }
}
