"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Dar de baja y reactivar un proveedor.
 *
 * Baja lógica, nunca `delete`. `proveedores.id` está referenciado desde
 * `compras` y `recepciones` con `on delete restrict`, así que borrar de verdad
 * o falla o —si algún día alguien pusiera cascade— se llevaría por delante el
 * histórico de compras. Un proveedor con el que ya no se trabaja sigue siendo
 * de quien vino la mercadería que hay en almacén.
 *
 * Un proveedor de baja desaparece del listado y de los desplegables, pero sus
 * recepciones antiguas siguen enseñando su nombre.
 */

const ROLES = ["gerencia", "admin", "compras"] as const;

const esquema = z.object({
  id: z.string().uuid(),
  activo: z.boolean(),
});

export type ResultadoEstado =
  | { ok: true; activo: boolean; razonSocial: string }
  | { ok: false; error: string };

export async function cambiarEstadoProveedor(
  _previo: ResultadoEstado | null,
  formData: FormData,
): Promise<ResultadoEstado> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede dar de baja proveedores." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse({
      id: formData.get("id"),
      activo: formData.get("activo") === "1",
    });
  } catch {
    return { ok: false, error: "Los datos no son válidos." };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("proveedores")
      .update({ activo: datos.activo, actualizado_en: new Date().toISOString() })
      .eq("id", datos.id)
      .select("razon_social, activo")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "No se encontró el proveedor." };

    revalidatePath("/proveedores");
    revalidatePath(`/proveedores/${datos.id}`);
    // Dar de baja un proveedor tiene que sacarlo también de los desplegables
    // de abastecimiento, no solo de su propio maestro.
    revalidatePath("/recepciones/nueva");
    revalidatePath("/compras");
    revalidatePath("/compras/nueva");

    return { ok: true, activo: data.activo, razonSocial: data.razon_social };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo cambiar el estado.",
    };
  }
}
