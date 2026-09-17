"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Los KITS: varios productos que se cotizan y se facturan como uno.
 *
 * Willy, 16/09 (8:58): *«cotízame esta lista de productos, unos 5 ítems. Pero
 * al final todo eso entra como entra una sola máquina: me lo vas a presentar
 * como un kit, kit de reparación para motorreductor de tal máquina»*. Hoy lo
 * hace a mano: cotiza los cinco, mira el total, y escribe OTRA cotización de
 * un solo ítem con ese precio.
 *
 * Luis, 17/09: *«es como los kits de cámaras de seguridad: te viene el cable,
 * las cámaras, el DVR, los accesorios, y te lo venden como kit, no por
 * separado»*.
 *
 * ---------------------------------------------------------------------------
 * El kit es un PRODUCTO con lista de materiales
 * ---------------------------------------------------------------------------
 * Con `productos.es_kit` y `kit_componentes` (085). No una tabla aparte: así
 * el buscador lo encuentra por código, el constructor lo agrega como una línea
 * y el documento lo imprime como un ítem, sin tocar ninguna de esas pantallas.
 *
 * Y su stock **no se guarda**: `stock_armable()` responde cuántos se pueden
 * armar con lo que hay. Decisión de Luis con las dos opciones delante — un
 * stock que se calcula no puede mentir, y no depende de que alguien se acuerde
 * de registrar que armó cinco.
 */

/** La misma lista que `permisos_rol` tiene para `productos`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export type ResultadoKit = { ok: true; id: string; codigo: string } | { ok: false; error: string };

const componente = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive().finite(),
  /**
   * Lo que vale esta pieza DENTRO del kit.
   *
   * Luis, 17/09: *«él puede variar el precio, igual como hacer una cotización
   * es hacer un kit»*. `null` = usa el de lista del producto; `0` = va sin
   * cargo, que es una decisión distinta de no haberlo puesto (087).
   */
  precio_unitario: z.number().nonnegative().finite().nullable(),
});

const esquema = z.object({
  /** Al editar. Sin id es un kit nuevo. */
  id: z.string().uuid().optional(),
  codigo: z.string().trim().min(1, "El código es obligatorio").max(60),
  descripcion: z.string().trim().min(3, "Falta la descripción").max(300),
  precio_venta: z.number().nonnegative().finite(),
  componentes: z
    .array(componente)
    .min(1, "Un kit tiene que llevar al menos un producto")
    .max(60),
});

type Guardia = { error: string } | { error?: undefined; perfilId: string };

async function guardia(): Promise<Guardia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { error: "Tu rol no puede tocar el catálogo. Lo mantienen Compras o Gerencia." };
  }
  return { perfilId: perfil.id };
}

/**
 * Guarda un kit: la ficha y su contenido, en una sola llamada.
 *
 * El contenido se reemplaza entero en vez de ir comparando qué cambió. Son
 * cinco o seis filas y es lo que hace la pantalla —se edita la lista y se
 * guarda—, así que calcular altas, bajas y modificaciones sería trabajo para
 * llegar al mismo sitio con más maneras de equivocarse.
 */
export async function guardarKit(datos: unknown): Promise<ResultadoKit> {
  const g = await guardia();
  if (g.error !== undefined) return { ok: false, error: g.error };

  const v = esquema.safeParse(datos);
  if (!v.success) {
    return { ok: false, error: v.error.issues[0]?.message ?? "Los datos no son válidos." };
  }

  // Dos veces el mismo producto en un kit: la clave primaria de
  // `kit_componentes` lo rechazaría con un error que no dice nada. Mejor
  // decirlo aquí, que es donde se puede corregir.
  const ids = new Set(v.data.componentes.map((c) => c.producto_id));
  if (ids.size !== v.data.componentes.length) {
    return { ok: false, error: "Hay un producto repetido en el kit. Súmale la cantidad en su línea." };
  }

  try {
    const supabase = await clienteServidor();

    // La familia KITS la crea la 085: `productos` exige marca, familia y
    // sub-familia, y un kit no tiene marca propia —lleva piezas de varias—,
    // así que va con «SIN MARCA», la misma de los 396 del Excel.
    const [{ data: fam }, { data: marca }] = await Promise.all([
      supabase.from("familias").select("id, subfamilias(id)").eq("codigo", "KITS").maybeSingle(),
      supabase.from("marcas").select("id").eq("nombre_norm", "SINMARCA").maybeSingle(),
    ]);

    const familiaId = (fam as { id?: string } | null)?.id;
    const subfamiliaId = (
      (fam as { subfamilias?: { id: string }[] } | null)?.subfamilias ?? []
    )[0]?.id;
    const marcaId = (marca as { id?: string } | null)?.id;

    if (!familiaId || !subfamiliaId || !marcaId) {
      return {
        ok: false,
        error: "Falta la familia KITS o la marca SIN MARCA en el catálogo.",
      };
    }

    const campos = {
      codigo: v.data.codigo,
      descripcion: v.data.descripcion,
      precio_venta: v.data.precio_venta,
      es_kit: true,
      marca_id: marcaId,
      familia_id: familiaId,
      subfamilia_id: subfamiliaId,
      unidad_codigo: "NIU",
      actualizado_en: new Date().toISOString(),
    };

    const fila = v.data.id
      ? await supabase
          .from("productos")
          .update(campos)
          .eq("id", v.data.id)
          .select("id, codigo")
          .maybeSingle()
      : await supabase
          .from("productos")
          .insert({ ...campos, creado_por: g.perfilId })
          .select("id, codigo")
          .maybeSingle();

    if (fila.error) {
      if (fila.error.code === "23505") {
        return {
          ok: false,
          error: `Ya existe un producto o kit con el código ${v.data.codigo}.`,
        };
      }
      return { ok: false, error: fila.error.message };
    }
    if (!fila.data) return { ok: false, error: "No se pudo guardar el kit." };

    const kitId = fila.data.id;

    // Fuera lo viejo, dentro lo nuevo.
    const { error: eBorrar } = await supabase
      .from("kit_componentes")
      .delete()
      .eq("kit_id", kitId);
    if (eBorrar) return { ok: false, error: eBorrar.message };

    const { error: eInsertar } = await supabase.from("kit_componentes").insert(
      v.data.componentes.map((c, i) => ({
        kit_id: kitId,
        producto_id: c.producto_id,
        cantidad: c.cantidad,
        precio_unitario: c.precio_unitario,
        orden: i + 1,
      })),
    );
    if (eInsertar) {
      /*
        El trigger de la 085 impide meter un kit dentro de otro. Su mensaje ya
        se entiende, así que se deja pasar tal cual en vez de traducirlo — lo
        que no se puede es enseñar el código de error de Postgres.
      */
      return { ok: false, error: eInsertar.message };
    }

    revalidatePath("/productos");
    revalidatePath("/productos/kits");
    return { ok: true, id: kitId, codigo: fila.data.codigo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el kit.",
    };
  }
}

/**
 * En qué OTROS kits está cada uno de estos productos.
 *
 * Luis, 17/09: *«también si el producto está en otro kit, así»*.
 *
 * Es la pregunta que aparece en cuanto hay más de un kit y no se puede
 * responder mirando: si se cambia el precio de un retén, o si se agota, hay
 * que saber a qué otros kits arrastra. Un o-ring puede estar en los seis.
 *
 * Y es información de decisión, no de adorno: quitar una pieza de un kit
 * porque «total, no la uso» es distinto si esa pieza sostiene otros tres.
 */
export async function otrosKitsDe(
  productoIds: string[],
  exceptoKitId?: string,
): Promise<Record<string, { id: string; codigo: string }[]>> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return {};
  if (productoIds.length === 0) return {};

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("kit_componentes")
      .select("producto_id, kit_id, productos!kit_componentes_kit_id_fkey(codigo, archivado)")
      .in("producto_id", productoIds.slice(0, 100));

    if (error) return {};

    const mapa: Record<string, { id: string; codigo: string }[]> = {};
    for (const f of (data ?? []) as unknown as {
      producto_id: string;
      kit_id: string;
      productos: { codigo: string; archivado: boolean } | null;
    }[]) {
      // El kit que se está editando no cuenta como «otro», y uno archivado
      // tampoco: ya no se cotiza, así que avisar de él sería ruido.
      if (f.kit_id === exceptoKitId) continue;
      if (!f.productos || f.productos.archivado) continue;
      (mapa[f.producto_id] ??= []).push({ id: f.kit_id, codigo: f.productos.codigo });
    }
    return mapa;
  } catch {
    // Que falle esto NO puede impedir editar un kit: es un aviso, no un dato
    // del que dependa guardar.
    return {};
  }
}
