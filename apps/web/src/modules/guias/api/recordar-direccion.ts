import "server-only";
import type { clienteServidor } from "@rodatech/db/servidor";

import { claveDireccion as clave } from "../dominio/direccion";

/**
 * Apunta la dirección de la guía en las del cliente, si no es la fiscal. La
 * llaman las acciones que guardan la guía, DESPUÉS de guardarla: si esto
 * falla, la guía ya está bien y no se le dice nada a nadie —es una comodidad
 * para la próxima, no parte del documento—.
 */
export async function recordarDireccionDeGuia(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  guiaId: string,
): Promise<void> {
  try {
    const { data: g } = await supabase
      .from("guias_remision")
      .select("cliente_id, direccion_llegada, ubigeo_llegada, clientes(direccion)")
      .eq("id", guiaId)
      .maybeSingle();
    const direccion = g?.direccion_llegada?.trim();
    if (!g?.cliente_id || !direccion || direccion.length < 3) return;
    const fiscal = (g.clientes as { direccion: string | null } | null)?.direccion ?? "";
    if (clave(direccion) === clave(fiscal)) return;

    await supabase.from("cliente_direcciones").upsert(
      {
        cliente_id: g.cliente_id,
        direccion,
        ubigeo_codigo: g.ubigeo_llegada ?? null,
        usado_en: new Date().toISOString(),
      },
      { onConflict: "cliente_id,clave" },
    );
  } catch (e) {
    console.error("[guias] no se pudo recordar la dirección de entrega", e);
  }
}
