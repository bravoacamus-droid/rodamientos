"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

/** Los mismos que `permisos_rol` tiene para `analisis_importacion` (098). */
const ROLES = ["gerencia", "admin", "compras"] as const;

async function exigirRol(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede hacer análisis de importación. Lo hacen Compras o Gerencia.";
  }
  return null;
}

const numero = z.number().finite().nonnegative();

/*
  TODOS los campos declarados. `z.object` quita en silencio lo que no conoce,
  y así se perdieron el peso y el reparto de las compras hasta el 01/10.
*/
const esquema = z.object({
  id: z.string().uuid().nullable().default(null),
  proveedor_id: z.string().uuid({ message: "Falta el proveedor." }),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  referencia: z.string().max(80).nullable().default(null),
  costo_envio: numero.max(10_000_000),
  peso_declarado: numero.max(1_000_000).nullable().default(null),
  notas: z.string().max(2000).nullable().default(null),
  items: z
    .array(
      z.object({
        producto_id: z.string().uuid().nullable().default(null),
        codigo: z.string().trim().min(1, "Hay una línea sin código.").max(80),
        marca: z.string().max(60).nullable().default(null),
        descripcion: z.string().max(300).nullable().default(null),
        cantidad_ref: numero.max(1_000_000),
        cantidad_pedido: numero.max(1_000_000),
        precio_fob: numero.max(10_000_000),
        peso_kg: numero.max(5000),
        precio_mercado: numero.max(10_000_000),
        proveedor_mercado: z.string().max(120).nullable().default(null),
        frecuencia: numero.max(10_000).nullable().default(null),
      }),
    )
    .min(1, "Añade los productos de la proforma.")
    .max(300, "Son demasiadas líneas para un análisis."),
});

export type ResultadoAnalisis =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

export async function guardarAnalisis(entrada: unknown): Promise<ResultadoAnalisis> {
  const problema = await exigirRol();
  if (problema) return { ok: false, error: problema };

  const v = esquema.safeParse(entrada);
  if (!v.success) {
    return { ok: false, error: v.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("guardar_analisis", {
      p_datos: v.data as never,
    });
    if (error) return { ok: false, error: mensajeDeError(error) };
    const r = data as unknown as { id: string; numero: string };
    revalidatePath("/compras/analisis");
    return { ok: true, id: r.id, numero: r.numero };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export type Propuestas = {
  /** Veces que salió en una factura el último año, por producto. */
  frecuencias: Record<string, number>;
  /** El último FOB que ESTE proveedor cotizó por cada producto. */
  fobs: Record<string, { precio: number; numero: string }>;
};

/**
 * Lo que el sistema ya sabe y propone al añadir productos (098):
 *
 *   · La «f», de sus facturas del último año.
 *   · El FOB de la última vez que este proveedor se lo cotizó. Willy, 01/10:
 *     *«los precios deben quedar en un historial […] para no volver a pedir
 *     en otra oportunidad, porque los precios son más o menos estables»*.
 */
export async function propuestasAnalisis(
  proveedorId: string | null,
  productoIds: string[],
  excluirAnalisisId?: string | null,
): Promise<Propuestas> {
  const vacio: Propuestas = { frecuencias: {}, fobs: {} };
  if (await exigirRol()) return vacio;
  const ids = productoIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 300);
  if (ids.length === 0) return vacio;

  try {
    const supabase = await clienteServidor();
    const [frec, hist] = await Promise.all([
      supabase.rpc("frecuencia_de_venta", { p_productos: ids }),
      proveedorId && /^[0-9a-f-]{36}$/i.test(proveedorId)
        ? supabase
            .from("analisis_importacion_items")
            .select("producto_id, precio_fob, analisis:analisis_importacion!inner(id, numero, proveedor_id, fecha, creado_en)")
            .in("producto_id", ids)
            .gt("precio_fob", 0)
            .eq("analisis.proveedor_id", proveedorId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const frecuencias: Record<string, number> = {};
    for (const f of (frec.data ?? []) as { producto_id: string; veces: number }[]) {
      frecuencias[f.producto_id] = Number(f.veces);
    }

    type Fila = {
      producto_id: string;
      precio_fob: number;
      analisis: { id: string; numero: string; creado_en: string };
    };
    const fobs: Propuestas["fobs"] = {};
    const fechas: Record<string, string> = {};
    for (const h of (hist.data ?? []) as unknown as Fila[]) {
      if (h.analisis.id === excluirAnalisisId) continue;
      const previa = fechas[h.producto_id];
      if (!previa || h.analisis.creado_en > previa) {
        fechas[h.producto_id] = h.analisis.creado_en;
        fobs[h.producto_id] = { precio: Number(h.precio_fob), numero: h.analisis.numero };
      }
    }
    return { frecuencias, fobs };
  } catch {
    return vacio;
  }
}
