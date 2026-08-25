"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Registro de una recepción de mercadería.
 *
 * La cabecera y las N líneas van en UNA llamada a `recepcionar_mercaderia()`,
 * que crea la recepción, sus ítems y TODOS los movimientos de kardex de una
 * vez. En la demo esto era un `insert` + un `rpc` por línea, secuenciales:
 * recibir 40 referencias eran 80 viajes al servidor.
 *
 * Aquí es donde entra el stock. Willy, 25:21: *"el stock se mueve al recibir
 * la mercadería"*, no con la orden ni con la factura.
 */

/**
 * Quién puede recepcionar.
 *
 * Es la misma lista que `permisos_rol` tiene para la tabla `recepciones`
 * (gerencia, admin, almacen, compras). Se comprueba aquí para dar un mensaje
 * legible; la que manda es la de Postgres, dentro de la propia función.
 */
const ROLES = ["gerencia", "admin", "almacen", "compras"] as const;

const esquemaItem = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive().finite(),
  costo_unitario: z.number().nonnegative().finite(),
});

const esquema = z.object({
  compra_id: z.string().uuid().nullable(),
  proveedor_id: z.string().uuid().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  guia_proveedor: z.string().max(60).nullable(),
  factura_proveedor: z.string().max(60).nullable(),
  observaciones: z.string().max(2000).nullable(),
  items: z.array(esquemaItem).min(1, "La recepción no tiene productos.").max(500),
});

export type ResultadoRecepcion =
  | { ok: true; id: string; numero: string; items: number; factorGastos: number }
  | { ok: false; error: string };

export async function registrarRecepcion(
  _previo: ResultadoRecepcion | null,
  formData: FormData,
): Promise<ResultadoRecepcion> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede recepcionar mercadería." };
  }

  const crudo = formData.get("recepcion");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la recepción." };
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

  // Dos líneas del mismo producto harían saltar el UNIQUE
  // (recepcion_id, producto_id) a mitad del INSERT, y el error de restricción
  // de Postgres no le dice nada a nadie. La pantalla ya las fusiona; esto
  // cubre a quien llame sin pasar por ella.
  const productos = new Set(datos.items.map((i) => i.producto_id));
  if (productos.size !== datos.items.length) {
    return {
      ok: false,
      error: "Hay un producto repetido en dos líneas. Únelas en una sola.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("recepcionar_mercaderia", {
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as {
      id: string;
      numero: string;
      items: number;
      factor_gastos: number;
    };

    revalidatePath("/recepciones");
    // El stock acaba de moverse: todo lo que lo enseña queda obsoleto en este
    // mismo instante.
    revalidatePath("/productos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      items: Number(r.items ?? 0),
      factorGastos: Number(r.factor_gastos ?? 1),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar la recepción.",
    };
  }
}
