"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Apuntarle el teléfono o el correo al cliente sin salir de la cotización.
 *
 * ---------------------------------------------------------------------------
 * Por qué hace falta
 * ---------------------------------------------------------------------------
 * Willy pidió mandar la cotización por WhatsApp y por correo (13:00 y 13:21).
 * Los dos botones existen — y con los datos de HOY no aparece ninguno: de los
 * **97 clientes activos, 0 tienen teléfono o WhatsApp y 1 tiene correo**.
 * Entraron del Excel sin esa columna.
 *
 * O sea, la función estaba y no la iba a ver nadie. Es el mismo caso que el
 * teléfono del proveedor en «Pedir precio», y se resuelve igual: se apunta
 * aquí mismo, en el momento en que hace falta, que es cuando se tiene delante.
 *
 * ---------------------------------------------------------------------------
 * Por qué no vale `guardarCliente`
 * ---------------------------------------------------------------------------
 * Esa guarda la ficha ENTERA y valida el RUC, la condición de pago, el ubigeo
 * y media docena de campos más. Con 97 clientes a medio llenar, la validación
 * completa rebotaría el guardado por algo que no tiene nada que ver con el
 * número que acaban de dar por teléfono.
 */

/** La misma lista que `permisos_rol` tiene para `clientes`. */
const ROLES = ["gerencia", "admin", "ventas"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  // Los tres opcionales y los tres a la vez: se apunta lo que se sepa. Vaciar
  // uno también es una decisión válida.
  telefono: z.string().trim().max(40).nullable().default(null),
  whatsapp: z.string().trim().max(40).nullable().default(null),
  email: z.string().trim().max(160).nullable().default(null),
});

export type ResultadoContactoCliente = { ok: true } | { ok: false; error: string };

const limpio = (v: string | null) => (v === null || v.trim() === "" ? null : v.trim());

export async function ponerContactoCliente(
  datosCrudos: unknown,
): Promise<ResultadoContactoCliente> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede editar clientes." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(datosCrudos);
  } catch {
    return { ok: false, error: "Los datos de contacto no son válidos." };
  }

  const correo = limpio(datos.email);
  if (correo !== null && !z.string().email().safeParse(correo).success) {
    return { ok: false, error: "Ese correo no tiene un formato válido." };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("clientes")
      .update({
        telefono: limpio(datos.telefono),
        whatsapp: limpio(datos.whatsapp),
        email: correo,
      })
      .eq("id", datos.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${datos.id}`);
    // La cotización es desde donde se apunta: sin esto, el botón de WhatsApp
    // no aparecería hasta recargar a mano.
    revalidatePath("/cotizaciones", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el contacto.",
    };
  }
}
