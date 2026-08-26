"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";

import { gastosDe } from "../api/consultas";

/**
 * Detallar en qué se fue el dinero de una importación: flete, seguro, aduana.
 *
 * La tabla `gastos_importacion` existía desde la 002 y estaba vacía. Desde la
 * 022 tiene un disparador que mantiene `compras.gastos_importacion` igual a la
 * suma del detalle, así que detallar NO es decorativo: cambia el número que la
 * recepción usa para prorratear el costo puesto en almacén.
 *
 * Por eso lleva cerrojo: solo se tocan los gastos de una compra que sigue en
 * «registrada». En cuanto entra mercadería, el costo ya está en el kardex y
 * cambiar el gasto dejaría la pantalla diciendo una cosa y el kardex otra. Eso
 * se corrige con un ajuste de inventario, que es la misma regla que ya tenía
 * la anulación de compras.
 *
 * El cerrojo lo impone la BASE, no esta función: aquí solo se traduce el error
 * a algo legible.
 */

/** La misma lista que `permisos_rol` tiene para `gastos_importacion`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

export type ResultadoGasto =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

const uuid = z.string().uuid();

const esquema = z.object({
  compra_id: uuid,
  concepto: z.string().trim().min(2, "Di en qué se fue").max(120),
  monto: z.number().positive("El monto tiene que ser mayor que cero").finite(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
  documento: z.string().trim().max(60).nullable(),
});

async function exigirPermiso(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede tocar los gastos de importación. Lo hacen Compras o Gerencia.";
  }
  return null;
}

/**
 * Traduce el cerrojo de la base a algo que se pueda leer.
 *
 * El mensaje de la excepción ya está escrito para una persona (022), así que
 * se deja pasar tal cual; lo que se atrapa aquí es el caso de RLS, cuyo
 * «new row violates row-level security policy» no le dice nada a nadie.
 */
function traducir(error: { message: string; code?: string }): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "Tu rol no puede tocar los gastos de esta compra.";
  }
  return mensajeDeError(error);
}

export async function agregarGasto(entrada: {
  compra_id: string;
  concepto: string;
  monto: number;
  fecha: string;
  documento: string | null;
}): Promise<ResultadoGasto> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };

  const datos = esquema.safeParse(entrada);
  if (!datos.success) {
    return { ok: false, error: `${datos.error.issues[0]?.message ?? "Datos no válidos"}.` };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("gastos_importacion").insert({
      compra_id: datos.data.compra_id,
      concepto: datos.data.concepto,
      monto: datos.data.monto,
      fecha: datos.data.fecha,
      documento: datos.data.documento,
    });

    if (error) return { ok: false, error: traducir(error) };

    revalidar();
    return { ok: true, mensaje: "Gasto anotado." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

export async function quitarGasto(id: string): Promise<ResultadoGasto> {
  const problema = await exigirPermiso();
  if (problema) return { ok: false, error: problema };
  if (!uuid.safeParse(id).success) return { ok: false, error: "El gasto no es válido." };

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.from("gastos_importacion").delete().eq("id", id);
    if (error) return { ok: false, error: traducir(error) };

    revalidar();
    return { ok: true, mensaje: "Gasto quitado." };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * El detalle de una importación, al vuelo.
 *
 * Envoltura de la consulta de `api/`, que es `server-only`: la pantalla la
 * pide al desplegar una fila, no al cargar, porque son decenas de compras y
 * traer los gastos de todas para enseñar los de una sería tirar el trabajo.
 */
export async function gastosDeCompra(compraId: string) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  if (!uuid.safeParse(compraId).success) {
    return { ok: false as const, error: "La compra no es válida." };
  }
  return gastosDe(compraId);
}

function revalidar() {
  revalidatePath("/importaciones");
  // El total de la compra cambia con el detalle: lo mantiene el disparador de
  // la 022.
  revalidatePath("/compras", "layout");
}
