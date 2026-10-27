"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

/**
 * Cambiar los precios de una marca de una vez (155), y deshacerlo.
 *
 * La base hace todo —calcula, guarda el precio anterior, cambia— y vuelve a
 * mirar el permiso. Aquí solo se valida la forma y se refrescan las pantallas.
 */

export interface VistaCambio {
  productos: number;
  ejemplos: { codigo: string; antes: number; despues: number }[];
  aplicado: boolean;
  cambioId: number | null;
}

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const esquema = z.object({
  marca: z.string().uuid("Elige una marca."),
  porcentaje: z.number().finite().min(-50, "Como mucho, bajar un 50 %.").max(100, "Como mucho, subir un 100 %."),
  aplicar: z.boolean(),
});

export async function cambiarPreciosPorMarca(entrada: unknown): Promise<Resultado<VistaCambio>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("productos", "editar");
  if (negado) return { ok: false, error: negado };

  const p = esquema.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos." };
  if (p.data.porcentaje === 0) return { ok: false, error: "Escribe cuánto sube o baja: cero no cambia nada." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("cambiar_precios_por_marca", {
    p_marca: p.data.marca,
    p_porcentaje: p.data.porcentaje,
    p_aplicar: p.data.aplicar,
  });
  if (error) return { ok: false, error: error.message };

  const d = data as { productos: number; ejemplos: VistaCambio["ejemplos"]; aplicado: boolean; cambio_id?: number };
  if (d.aplicado) {
    revalidatePath("/productos");
    revalidatePath("/cotizaciones/nueva");
  }
  return {
    ok: true,
    datos: {
      productos: Number(d.productos ?? 0),
      ejemplos: (d.ejemplos ?? []).map((e) => ({ codigo: e.codigo, antes: Number(e.antes), despues: Number(e.despues) })),
      aplicado: Boolean(d.aplicado),
      cambioId: d.cambio_id ?? null,
    },
  };
}

export async function deshacerCambioPrecios(
  cambioId: unknown,
): Promise<Resultado<{ devueltos: number; respetados: number; deshecho: boolean }>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("productos", "editar");
  if (negado) return { ok: false, error: negado };
  const id = z.number().int().positive().safeParse(cambioId);
  if (!id.success) return { ok: false, error: "Cambio no válido." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("deshacer_cambio_precios", { p_cambio: id.data });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/productos");
  const d = data as { devueltos: number; respetados: number; deshecho?: boolean };
  const devueltos = Number(d.devueltos ?? 0);
  return {
    ok: true,
    datos: {
      devueltos,
      respetados: Number(d.respetados ?? 0),
      // Antes de la 160 la base no lo devolvía y marcaba siempre.
      deshecho: d.deshecho ?? devueltos > 0,
    },
  };
}

/**
 * Los últimos cambios de precio, para deshacerlos DESPUÉS (QA-08, 27/10).
 *
 * `cambios_precio` guardaba la historia desde la 155 y ninguna pantalla la
 * leía: solo se podía deshacer con el diálogo abierto, justo después. Si el
 * dedo se fue y alguien lo nota mañana, ya no había botón.
 */
export interface CambioPrecio {
  id: number;
  creadoEn: string;
  marca: string;
  porcentaje: number;
  productos: number;
  quien: string | null;
  deshechoEn: string | null;
}

export async function ultimosCambiosPrecio(): Promise<Resultado<CambioPrecio[]>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("productos", "editar");
  if (negado) return { ok: false, error: negado };

  const supabase = await clienteServidor();
  // Dos claves a `perfiles` (creado_por y deshecho_por): sin decir cuál,
  // PostgREST tumba la consulta entera (PGRST201, §AN).
  const { data, error } = await supabase
    .from("cambios_precio")
    .select("id, creado_en, porcentaje, productos, deshecho_en, marcas(nombre), quien:perfiles!cambios_precio_creado_por_fkey(nombre)")
    .order("id", { ascending: false })
    .limit(15);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    datos: (data ?? []).map((c) => {
      const marca = c.marcas as { nombre: string } | { nombre: string }[] | null;
      const quien = c.quien as { nombre: string | null } | { nombre: string | null }[] | null;
      const uno = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
      return {
        id: Number(c.id),
        creadoEn: String(c.creado_en),
        marca: uno(marca)?.nombre ?? "—",
        porcentaje: Number(c.porcentaje),
        productos: Number(c.productos),
        quien: uno(quien)?.nombre ?? null,
        deshechoEn: (c.deshecho_en as string | null) ?? null,
      };
    }),
  };
}
