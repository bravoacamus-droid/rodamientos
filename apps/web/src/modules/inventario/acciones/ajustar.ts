"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import type { Json } from "@rodatech/db/tipos";

/**
 * Cuadre de inventario: la hoja de conteo completa en una sola llamada.
 *
 * Willy lo describió como *"un botón que lo va a usar con cuidado"* (26:49), y
 * de ahí salen las dos restricciones: **solo gerencia**, y **motivo
 * obligatorio**.
 *
 * Esto NO escribe el saldo. `registrar_ajuste_inventario()` crea el documento
 * de ajuste con sus ítems y deja que el kardex recalcule, así que el saldo
 * sigue siendo la suma de sus movimientos. Es la diferencia entre poder
 * auditar un descuadre y encontrárselo tres meses después sin saber quién lo
 * hizo — que es exactamente cómo el costo promedio del 6205 acabó mintiendo.
 */

/**
 * Solo gerencia.
 *
 * Es la misma restricción que impone `registrar_ajuste_inventario()` con
 * `es_gerencia()`, que a su vez es `tiene_rol('gerencia','admin')`. Se
 * comprueba aquí para dar un mensaje legible; la que manda es la de Postgres.
 */
const ROLES = ["gerencia", "admin"] as const;

const esquema = z.object({
  tipo: z.enum(["descuadre", "cuadre_inicial", "merma", "devolucion_interna"]),
  motivo: z
    .string()
    .trim()
    .min(4, "Explica el motivo del ajuste.")
    .max(200, "El motivo es demasiado largo."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  items: z
    .array(
      z.object({
        producto_id: z.string().uuid(),
        cantidad_fisica: z.number().nonnegative().finite(),
      }),
    )
    .min(1, "No se ha contado ningún producto.")
    .max(1000),
});

export type ResultadoAjuste =
  | { ok: true; id: string; numero: string; ajustados: number }
  | { ok: false; error: string };

export async function registrarCuadre(
  _previo: ResultadoAjuste | null,
  formData: FormData,
): Promise<ResultadoAjuste> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "El cuadre de inventario está restringido a Gerencia." };
  }

  const crudo = formData.get("ajuste");
  if (typeof crudo !== "string") return { ok: false, error: "No llegaron los datos." };

  // Una Server Action es un endpoint público: la entrada es hostil hasta que
  // se demuestre lo contrario, venga de nuestra pantalla o no.
  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // Dos conteos del mismo producto son contradictorios, y la base los
  // procesaría los dos: el segundo movimiento partiría del saldo que dejó el
  // primero y el resultado dependería del orden.
  const productos = new Set(datos.items.map((i) => i.producto_id));
  if (productos.size !== datos.items.length) {
    return {
      ok: false,
      error: "Hay un producto contado dos veces. Deja un solo conteo por producto.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("registrar_ajuste_inventario", {
      p_datos: datos as unknown as Json,
    });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { id: string; numero: string; ajustados: number };

    // El stock acaba de moverse: todo lo que lo enseña queda obsoleto ahora.
    revalidatePath("/inventario");
    revalidatePath("/inventario/kardex");
    revalidatePath("/productos");
    revalidatePath("/dashboard");

    return {
      ok: true,
      id: r.id,
      numero: r.numero,
      ajustados: Number(r.ajustados ?? 0),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar el cuadre.",
    };
  }
}
