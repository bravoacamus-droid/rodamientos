"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Ajuste rápido de stock desde el listado.
 *
 * Willy pidió el cuadre como *"un botón que se usa con cuidado"* (26:49), y por
 * eso esto NO escribe el saldo: registra un MOVIMIENTO y deja que el kardex
 * recalcule. La diferencia importa — el saldo de almacén es la suma de sus
 * movimientos, y si se pudiera escribir a mano se perdería la trazabilidad
 * justo donde más falta hace.
 *
 * El motivo es obligatorio. Un ajuste sin explicación es un descuadre que
 * nadie va a poder auditar en tres meses.
 */

// Solo gerencia. Es la misma restricción que ya impone
// `registrar_ajuste_inventario()` en la base, y viene de que Willy describió
// el cuadre como "un botón que se usa con cuidado" (26:49). Ponerlo más
// abierto aquí solo conseguiría que el rebote llegara desde Postgres.
const ROLES = ["gerencia", "admin"] as const;

const esquema = z.object({
  producto_id: z.string().uuid(),
  // Cuánto hay DE VERDAD tras contar. La diferencia la calcula el servidor.
  cantidad_real: z.number().nonnegative().finite(),
  motivo: z.string().trim().min(4, "Explica el motivo del ajuste").max(200),
});

export type ResultadoStock =
  | { ok: true; anterior: number; nuevo: number; diferencia: number }
  | { ok: false; error: string };

export async function ajustarStock(
  _previo: ResultadoStock | null,
  formData: FormData,
): Promise<ResultadoStock> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return {
      ok: false,
      error: "El cuadre de inventario está restringido a Gerencia.",
    };
  }

  const crudo = formData.get("ajuste");
  if (typeof crudo !== "string") return { ok: false, error: "Faltan los datos." };

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : null;
    return { ok: false, error: detalle ?? "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();

    const { data: saldo, error: eSaldo } = await supabase
      .from("stock")
      .select("cantidad")
      .eq("producto_id", datos.producto_id)
      .maybeSingle();
    if (eSaldo) return { ok: false, error: eSaldo.message };

    const anterior = Number(saldo?.cantidad ?? 0);
    const diferencia = Number((datos.cantidad_real - anterior).toFixed(2));

    if (diferencia === 0) {
      return { ok: false, error: "El conteo coincide con el saldo: no hay nada que ajustar." };
    }

    // Va por `registrar_ajuste_inventario` y NO por `registrar_movimientos`.
    //
    // La diferencia no es de estilo: `registrar_movimientos` es un ayudante
    // interno sin control de rol, y dejarlo expuesto significaba que cualquier
    // usuario con sesión podía alterar el stock llamándolo directo. Además
    // esta crea la cabecera del ajuste, así que el movimiento queda colgado de
    // un documento con número, fecha, motivo y responsable, y no suelto en el
    // kardex.
    const { error } = await supabase.rpc("registrar_ajuste_inventario", {
      p_datos: {
        tipo: "descuadre",
        motivo: datos.motivo,
        items: [
          {
            producto_id: datos.producto_id,
            cantidad_fisica: datos.cantidad_real,
          },
        ],
      } as never,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/productos");
    revalidatePath(`/productos/${datos.producto_id}`);
    revalidatePath("/inventario");
    revalidatePath("/dashboard");

    return { ok: true, anterior, nuevo: datos.cantidad_real, diferencia };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo ajustar el stock.",
    };
  }
}
