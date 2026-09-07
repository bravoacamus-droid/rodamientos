"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Ponerle el teléfono a un proveedor sin salir de donde estás.
 *
 * ---------------------------------------------------------------------------
 * Por qué no vale `guardarProveedor`
 * ---------------------------------------------------------------------------
 * Esa guarda la ficha ENTERA y valida el RUC, la condición de pago, el tipo y
 * media docena de campos más. Para apuntar un número que te acaban de dar por
 * teléfono eso es pedir que se revalide todo lo demás — y con los 97
 * proveedores que entraron del Excel, media ficha está a medio llenar: la
 * validación completa rebotaría el guardado por algo que no tiene nada que ver
 * con el número.
 *
 * Aquí solo se tocan las tres formas de hablar con él.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale
 * ---------------------------------------------------------------------------
 * En «Pedir precio», el proveedor sin WhatsApp ni correo salía con un enlace a
 * su ficha. Pulsarlo **te sacaba de la pantalla y al volver habías perdido
 * todo**: los proveedores marcados, las cantidades, el reparto. Luis lo dijo
 * tal cual: *«en vez de rellenar ahí mismo con un modal me mandaba al perfil
 * del proveedor y regresaba a compra y se borró todo lo que llevé»*.
 */

/** La misma lista que `permisos_rol` tiene para `proveedores`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  // Los tres opcionales y los tres a la vez: se está apuntando lo que se sepa,
  // no rellenando un formulario. Vaciar uno también es una decisión válida.
  telefono: z.string().trim().max(40).nullable().default(null),
  whatsapp: z.string().trim().max(40).nullable().default(null),
  email: z.string().trim().max(160).nullable().default(null),
});

export type ResultadoContactoProveedor =
  | { ok: true }
  | { ok: false; error: string };

export async function ponerContactoProveedor(
  datosCrudos: unknown,
): Promise<ResultadoContactoProveedor> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede editar proveedores." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(datosCrudos);
  } catch {
    return { ok: false, error: "Los datos del contacto no son válidos." };
  }

  const correo = datos.email === null || datos.email === "" ? null : datos.email;
  if (correo !== null && !z.string().email().safeParse(correo).success) {
    return { ok: false, error: "Ese correo no tiene un formato válido." };
  }

  // Vacío es null, no cadena vacía: la pantalla pregunta «¿tiene WhatsApp?» con
  // un `!= null`, y un "" haría que el botón de mandar existiera apuntando a
  // ninguna parte.
  const limpio = (v: string | null) => (v === null || v.trim() === "" ? null : v.trim());

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from("proveedores")
      .update({
        telefono: limpio(datos.telefono),
        whatsapp: limpio(datos.whatsapp),
        email: correo,
      })
      .eq("id", datos.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/proveedores");
    revalidatePath(`/proveedores/${datos.id}`);
    revalidatePath("/compras/pedir-precio");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el contacto.",
    };
  }
}
