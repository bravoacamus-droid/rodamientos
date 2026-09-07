"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Ajustar el precio de venta y el piso, desde donde se ve el costo.
 *
 * ---------------------------------------------------------------------------
 * Por qué esto vive aquí y no solo en la ficha del producto
 * ---------------------------------------------------------------------------
 * Luis: *«la idea es que tenga otro campo card del producto que me traiga el
 * precio de compra más barato que registré automáticamente, y poder editar el
 * precio de venta y el precio mínimo de venta si es que quiere cambiar»*. Y
 * antes: *«todo manda desde compras»*.
 *
 * Tiene toda la lógica del negocio. El momento en que se sabe a cuánto sale de
 * verdad un rodamiento es cuando el proveedor contesta — y es EXACTAMENTE el
 * momento en que hay que decidir a cuánto se vende. Obligar a apuntarse el
 * costo, salir a la ficha del producto y volver es garantizar que no se haga:
 * el precio de venta se queda con el del año pasado y el margen se lo come la
 * inflación en silencio.
 *
 * ---------------------------------------------------------------------------
 * Ligera a propósito
 * ---------------------------------------------------------------------------
 * `guardarProducto` valida la ficha entera —familia, unidad, códigos, marca— y
 * de los 790 productos del catálogo muchos están a medio llenar. Usarla aquí
 * rebotaría el guardado de dos números por algo que no tiene nada que ver.
 */

/** Quien decide a cuánto se vende. Compras negocia; el precio es de gerencia. */
const ROLES = ["gerencia", "admin", "ventas", "compras"] as const;

const esquema = z.object({
  producto_id: z.string().uuid(),
  // Cero significa «sin definir» en el maestro (002), así que se admite: es
  // como se borra un piso que ya no se quiere.
  precio_venta: z.number().nonnegative().finite(),
  precio_minimo: z.number().nonnegative().finite(),
});

export type ResultadoPrecios = { ok: true } | { ok: false; error: string };

export async function ajustarPreciosDeVenta(
  datosCrudos: unknown,
): Promise<ResultadoPrecios> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede cambiar precios." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(datosCrudos);
  } catch {
    return { ok: false, error: "Los precios no son válidos." };
  }

  /*
    El mismo invariante que `productos_precio_min_lista` de la 002, dicho con
    palabras.

    La base lo rechazaría igual, pero con «viola una restricción»: quien acaba
    de teclear dos números merece que se le diga cuál de los dos está mal.
    Mismo criterio que en `abrirRonda`.
  */
  if (
    datos.precio_minimo > 0 &&
    datos.precio_venta > 0 &&
    datos.precio_minimo > datos.precio_venta
  ) {
    return {
      ok: false,
      error: "El piso no puede quedar por encima del precio de venta.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("productos")
      .update({
        precio_venta: datos.precio_venta,
        precio_minimo: datos.precio_minimo,
      })
      .eq("id", datos.producto_id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/productos");
    revalidatePath(`/productos/${datos.producto_id}`);
    revalidatePath("/compras/precios");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudieron guardar los precios.",
    };
  }
}
