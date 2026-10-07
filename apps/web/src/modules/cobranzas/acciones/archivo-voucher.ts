import "server-only";

import { randomUUID } from "node:crypto";

import type { clienteServidor } from "@rodatech/db/servidor";

/**
 * Subir el voucher de un cobro al bucket privado `vouchers-cobro` (109).
 *
 * Fuera de un archivo "use server" a propósito: lo usan dos acciones —cobrar
 * con voucher y ponerlo después— y una función exportada desde "use server"
 * sería un endpoint más, que sube archivos sin mirar el rol.
 */

export const BUCKET_VOUCHERS = "vouchers-cobro";
const MAXIMO = 10 * 1024 * 1024;

const TIPOS_OK: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export interface VoucherSubido {
  voucher_ruta: string;
  voucher_nombre: string;
  voucher_mime: string;
}

/** `null` si no vino ningún archivo; un texto si vino y no vale. */
export function revisarVoucher(archivo: FormDataEntryValue | null): File | string | null {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  if (archivo.size > MAXIMO) {
    return `El voucher pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope son 10 MB.`;
  }
  if (!TIPOS_OK[archivo.type]) return "El voucher tiene que ser un PDF o una foto (JPG, PNG, WEBP, HEIC).";
  return archivo;
}

export async function subirVoucher(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  archivo: File,
  comprobanteId: string,
): Promise<VoucherSubido | string> {
  // uuid propio y no el nombre: dos «voucher.jpg» del mismo día se pisarían.
  // Empieza por `cobros/`, que es lo que exige `pago_voucher_ruta_ok`.
  const ruta = `cobros/${comprobanteId}/${randomUUID()}.${TIPOS_OK[archivo.type]}`;
  const { error } = await supabase.storage
    .from(BUCKET_VOUCHERS)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) return error.message;
  return {
    voucher_ruta: ruta,
    voucher_nombre: archivo.name.slice(0, 200),
    voucher_mime: archivo.type,
  };
}
