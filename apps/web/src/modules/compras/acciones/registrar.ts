"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Registro de una compra.
 *
 * La cabecera y las N líneas van en UNA llamada a `crear_compra()`, que además
 * pide el correlativo y calcula el dinero desde los ítems. Hacerlo con dos
 * inserts sueltos por PostgREST no sería atómico: si el segundo falla queda una
 * compra huérfana con su número quemado, y el correlativo no se puede
 * devolver.
 *
 * Comprar NO mueve stock. Willy, 25:21: *"el stock se mueve al recibir la
 * mercadería"*. Esta acción no toca el kardex; lo hará la recepción que
 * consuma esta compra.
 */

/**
 * Quién puede comprar.
 *
 * Es la misma lista que `permisos_rol` tiene para la tabla `compras`
 * (gerencia, admin, compras). Se comprueba aquí para dar un mensaje legible;
 * la que manda es la de Postgres, dentro de la propia función.
 */
const ROLES = ["gerencia", "admin", "compras"] as const;

const esquemaItem = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive().finite(),
  costo_unitario: z.number().nonnegative().finite(),
  unidad_codigo: z.string().min(1).max(10),
});

const esquema = z.object({
  proveedor_id: z.string().uuid({ message: "Falta el proveedor." }),
  tipo: z.enum(["local", "importacion"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  fecha_estimada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha estimada no es válida.")
    .nullable(),
  documento_proveedor: z.string().max(60).nullable(),
  guia_proveedor: z.string().max(60).nullable(),
  afecto_igv: z.boolean(),
  // 042. El check de la base es quien manda; esto da el mensaje legible.
  moneda: z.enum(["USD", "PEN"]).default("USD"),
  tipo_cambio: z.number().positive().finite().nullable().default(null),
  gastos_importacion: z.number().nonnegative().finite(),
  tracking: z.string().max(80).nullable(),
  courier: z.string().max(60).nullable(),
  observaciones: z.string().max(2000).nullable(),
  items: z.array(esquemaItem).min(1, "La compra no tiene productos.").max(500),
});

export type ResultadoCompra =
  | {
      ok: true;
      id: string;
      numero: string;
      items: number;
      subtotal: number;
      igv: number;
      total: number;
    }
  | { ok: false; error: string };

export async function registrarCompra(
  _previo: ResultadoCompra | null,
  formData: FormData,
): Promise<ResultadoCompra> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede registrar compras." };
  }

  const crudo = formData.get("compra");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la compra." };
  }

  // Una Server Action es un endpoint público: la entrada es hostil hasta que
  // se demuestre lo contrario, venga de nuestra pantalla o no.
  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // Una compra en soles sin tipo de cambio se para AQUÍ, con un mensaje
  // que dice qué falta. Si llegara a la base, el check `compras_tc_coherente`
  // la rechazaría igual, pero con «viola una restricción», que no le sirve
  // a nadie. Es el mismo invariante en tres capas, a propósito.
  if (datos.moneda !== "USD" && !datos.tipo_cambio) {
    return {
      ok: false,
      error:
        "Falta el tipo de cambio. Una compra en soles necesita saber a cuánto estaba el dólar ese día, o el costo entraría al inventario multiplicado por cuatro.",
    };
  }

  // Dos líneas del mismo producto harían saltar el UNIQUE
  // (compra_id, producto_id) a mitad del INSERT. La pantalla ya las fusiona;
  // esto cubre a quien llame sin pasar por ella. La función también lo
  // comprueba: son tres capas del mismo invariante, a propósito.
  const productos = new Set(datos.items.map((i) => i.producto_id));
  if (productos.size !== datos.items.length) {
    return {
      ok: false,
      error: "Hay un producto repetido en dos líneas. Únelas en una sola.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("crear_compra", {
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as {
      id: string;
      numero: string;
      items: number;
      subtotal: number;
      igv: number;
      total: number;
    };

    revalidatePath("/compras");
    // La recepción precarga las compras pendientes: acaba de haber una más.
    revalidatePath("/recepciones/nueva");

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      items: Number(r.items ?? 0),
      subtotal: Number(r.subtotal ?? 0),
      igv: Number(r.igv ?? 0),
      total: Number(r.total ?? 0),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar la compra.",
    };
  }
}
