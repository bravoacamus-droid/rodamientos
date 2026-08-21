"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Alta y edición de un producto del maestro.
 *
 * Willy (10:44) fue explícito en que el alta va POR EL MAESTRO y no desde la
 * cotización: el atajo de su sistema actual *"no creo que sea lo adecuado"*.
 * Crear productos mientras se cotiza es como se llena un catálogo de duplicados.
 */

const ROLES = ["gerencia", "admin", "compras"] as const;

const esquema = z.object({
  id: z.string().uuid().optional(),
  // El código admite espacios INTERIORES: "7210 BEP" es un código real del
  // cliente. Lo que no se admite es que venga con espacios en los bordes.
  codigo: z
    .string()
    .trim()
    .min(1, "El código es obligatorio")
    .max(60, "El código es demasiado largo"),
  codigo_fabricante: z.string().trim().max(60).nullable(),
  descripcion: z.string().trim().min(3, "Falta la descripción").max(300),
  marca_id: z.string().uuid("Elige una marca"),
  familia_id: z.string().uuid("Elige una familia"),
  subfamilia_id: z.string().uuid("Elige una sub-familia"),
  tipo_id: z.string().uuid().nullable(),
  unidad_codigo: z.string().min(2).max(4),
  ultimo_costo: z.number().nonnegative().finite(),
  precio_venta: z.number().nonnegative().finite(),
  precio_minimo: z.number().nonnegative().finite(),
  stock_minimo: z.number().nonnegative().finite(),
  stock_maximo: z.number().nonnegative().finite(),
  peso_kg: z.number().nonnegative().finite(),
  ubicacion: z.string().trim().max(60).nullable(),
});

export type ResultadoProducto =
  | { ok: true; id: string; codigo: string }
  | { ok: false; error: string; campo?: string };

export async function guardarProducto(
  _previo: ResultadoProducto | null,
  formData: FormData,
): Promise<ResultadoProducto> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return {
      ok: false,
      error: "Tu rol no puede tocar el maestro de productos. Lo mantienen Compras o Gerencia.",
    };
  }

  const crudo = formData.get("producto");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos del formulario." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    if (e instanceof z.ZodError) {
      const primero = e.issues[0];
      return {
        ok: false,
        error: primero?.message ?? "Los datos no son válidos.",
        campo: primero?.path.join("."),
      };
    }
    return { ok: false, error: "Los datos no son válidos." };
  }

  // El piso por encima del precio de venta lo rechaza la base con un check,
  // pero ese error no se entiende. Mejor decirlo aquí.
  if (
    datos.precio_minimo > 0 &&
    datos.precio_venta > 0 &&
    datos.precio_minimo > datos.precio_venta
  ) {
    return {
      ok: false,
      campo: "precio_minimo",
      error: `El precio mínimo (${datos.precio_minimo}) no puede superar al de venta (${datos.precio_venta}).`,
    };
  }
  if (datos.stock_maximo > 0 && datos.stock_maximo < datos.stock_minimo) {
    return {
      ok: false,
      campo: "stock_maximo",
      error: "El stock máximo no puede ser menor que el mínimo.",
    };
  }

  const { id, ...campos } = datos;

  try {
    const supabase = await clienteServidor();

    // La jerarquía tiene FKs COMPUESTAS: no basta con que existan los tres
    // ids, tienen que encajar entre sí. Se comprueba antes para poder decir
    // cuál no cuadra, en vez de dejar que salte la restricción.
    const { data: sub, error: eSub } = await supabase
      .from("subfamilias")
      .select("id, familia_id")
      .eq("id", campos.subfamilia_id)
      .maybeSingle();
    if (eSub) return { ok: false, error: eSub.message };
    if (!sub || sub.familia_id !== campos.familia_id) {
      return {
        ok: false,
        campo: "subfamilia_id",
        error: "Esa sub-familia no pertenece a la familia elegida.",
      };
    }
    if (campos.tipo_id) {
      const { data: tipo, error: eTipo } = await supabase
        .from("tipos")
        .select("id, subfamilia_id")
        .eq("id", campos.tipo_id)
        .maybeSingle();
      if (eTipo) return { ok: false, error: eTipo.message };
      if (!tipo || tipo.subfamilia_id !== campos.subfamilia_id) {
        return {
          ok: false,
          campo: "tipo_id",
          error: "Esa descripción no pertenece a la sub-familia elegida.",
        };
      }
    }

    const fila = id
      ? await supabase
          .from("productos")
          .update({ ...campos, actualizado_en: new Date().toISOString() })
          .eq("id", id)
          .select("id, codigo")
          .maybeSingle()
      : await supabase
          .from("productos")
          // `costo_promedio` solo se siembra al crear: a partir de la primera
          // recepción lo manda el kardex, y pisarlo desde un formulario
          // falsearía el margen de todo el histórico.
          .insert({ ...campos, costo_promedio: campos.ultimo_costo, creado_por: perfil.id })
          .select("id, codigo")
          .maybeSingle();

    if (fila.error) {
      // 23505 = unique_violation. El único UNIQUE que puede saltar aquí es el
      // del código normalizado.
      if (fila.error.code === "23505") {
        return {
          ok: false,
          campo: "codigo",
          error: `Ya existe un producto con el código ${campos.codigo}. Recuerda que "6205 2RS" y "6205-2RS" son el mismo código.`,
        };
      }
      return { ok: false, error: fila.error.message };
    }
    if (!fila.data) {
      return { ok: false, error: "No se pudo guardar el producto." };
    }

    revalidatePath("/productos");
    revalidatePath(`/productos/${fila.data.id}`);
    revalidatePath("/inventario");
    return { ok: true, id: fila.data.id, codigo: fila.data.codigo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el producto.",
    };
  }
}

/**
 * Archivar y reactivar (24:21).
 *
 * Archivar NO es borrar: el producto sale del cotizador pero conserva su
 * historial y se puede reactivar. Por eso es un flag y no un DELETE.
 */
export async function archivarProducto(
  id: string,
  archivar: boolean,
  motivo?: string,
): Promise<{ ok: boolean; error?: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede archivar productos." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Producto no válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("productos")
      .update(
        archivar
          ? {
              archivado: true,
              archivado_en: new Date().toISOString(),
              archivado_por: perfil.id,
              motivo_archivado: motivo?.trim() || null,
            }
          : {
              archivado: false,
              archivado_en: null,
              archivado_por: null,
              motivo_archivado: null,
            },
      )
      .eq("id", id);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/productos");
    revalidatePath(`/productos/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo archivar." };
  }
}
