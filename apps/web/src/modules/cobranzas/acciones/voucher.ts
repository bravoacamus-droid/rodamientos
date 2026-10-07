"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { BUCKET_VOUCHERS, revisarVoucher, subirVoucher } from "./archivo-voucher";

/**
 * El voucher de un cobro YA registrado: ponerlo, cambiarlo y verlo (109).
 *
 * Muchas veces el voucher llega después que el aviso —el cliente llama, se
 * registra el pago, y la foto de la transferencia la manda por la tarde—, así
 * que no basta con poder subirlo al cobrar.
 */

/** La misma lista que `permisos_rol` tiene para `pagos`. */
const ROLES = ["gerencia", "admin", "cobranzas"] as const;

export type ResultadoVoucher = { ok: true } | { ok: false; error: string };

export async function ponerVoucher(formData: FormData): Promise<ResultadoVoucher> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede tocar los cobros." };
  }

  const id = formData.get("pago_id");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Ese pago no vale." };
  const archivo = revisarVoucher(formData.get("archivo"));
  if (archivo === null) return { ok: false, error: "No llegó ningún archivo." };
  if (typeof archivo === "string") return { ok: false, error: archivo };

  try {
    const supabase = await clienteServidor();
    const { data: pago, error } = await supabase
      .from("pagos")
      .select("id, comprobante_id, voucher_ruta")
      .eq("id", id as string)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!pago) return { ok: false, error: "Ese pago ya no existe." };

    const subido = await subirVoucher(supabase, archivo, String(pago.comprobante_id));
    if (typeof subido === "string") return { ok: false, error: subido };

    const { error: errorApunta } = await supabase.from("pagos").update(subido).eq("id", pago.id);
    if (errorApunta) {
      // Sin la fila, el archivo quedaría huérfano ocupando espacio.
      await supabase.storage.from(BUCKET_VOUCHERS).remove([subido.voucher_ruta]);
      return { ok: false, error: errorApunta.message };
    }
    // El de antes, si lo había, ya no lo apunta nadie.
    if (pago.voucher_ruta) await supabase.storage.from(BUCKET_VOUCHERS).remove([pago.voucher_ruta]);

    revalidatePath("/cobranzas");
    revalidatePath(`/facturacion/${String(pago.comprobante_id)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el voucher." };
  }
}

/** Enlace de diez minutos. Entra el id del pago; la ruta la pone la base. */
export async function enlaceVoucher(
  pagoId: string,
): Promise<{ ok: true; url: string; nombre: string; esPdf: boolean } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!z.string().uuid().safeParse(pagoId).success) return { ok: false, error: "Ese pago no vale." };

  try {
    const supabase = await clienteServidor();
    const { data: fila, error } = await supabase
      .from("pagos")
      .select("voucher_ruta, voucher_nombre, voucher_mime")
      .eq("id", pagoId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!fila?.voucher_ruta) return { ok: false, error: "Ese pago no tiene voucher." };
    const { data, error: errorUrl } = await supabase.storage
      .from(BUCKET_VOUCHERS)
      .createSignedUrl(fila.voucher_ruta, 600);
    if (errorUrl || !data?.signedUrl) return { ok: false, error: errorUrl?.message ?? "No se pudo abrir." };
    return {
      ok: true,
      url: data.signedUrl,
      nombre: fila.voucher_nombre ?? "voucher",
      esPdf: fila.voucher_mime === "application/pdf",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo abrir el voucher." };
  }
}
