"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * El comprobante de retención (CR) de una factura (120).
 *
 * Willy, 14/10: los CR le llegan por correo en PDF —o no llegan— y al cabo
 * del año tenía S/ 5 000 retenidos sin declarar. Aquí se cuelga cada uno de
 * su factura; el mismo PDF no entra en dos (la base lo impide por su huella,
 * `sha256`), y se dice en cuál está.
 */

const BUCKET_CR = "comprobantes-retencion";
const MAXIMO = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Quien toca los cobros: la misma lista que `permisos_rol` tiene para `pagos`. */
const ROLES = ["gerencia", "admin", "cobranzas", "ventas"] as const;

export type ResultadoCr = { ok: true } | { ok: false; error: string };

export async function registrarCr(formData: FormData): Promise<ResultadoCr> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede registrar comprobantes de retención." };
  }

  const id = formData.get("comprobante_id");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa factura no vale." };
  const numero = String(formData.get("numero_cr") ?? "").trim().slice(0, 40) || null;
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No llegó ningún archivo." };
  if (archivo.size > MAXIMO) return { ok: false, error: "El archivo pasa de 10 MB." };
  const ext = TIPOS[archivo.type];
  if (!ext) return { ok: false, error: "El CR tiene que ser un PDF o una foto (JPG, PNG, WEBP)." };

  try {
    const supabase = await clienteServidor();
    const { data: factura, error: errorFactura } = await supabase
      .from("comprobantes")
      .select("id, numero, retencion_aplica, estado")
      .eq("id", id as string)
      .maybeSingle();
    if (errorFactura) return { ok: false, error: errorFactura.message };
    if (!factura) return { ok: false, error: "Esa factura ya no existe." };
    if (!factura.retencion_aplica) return { ok: false, error: `${factura.numero} no tiene retención: no lleva CR.` };

    const bytes = Buffer.from(await archivo.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // El mismo PDF en OTRA factura: se dice en cuál, antes de subir nada.
    const { data: repetido } = await supabase
      .from("comprobante_retenciones")
      .select("comprobante_id, comprobantes(numero)")
      .eq("sha256", sha256)
      .maybeSingle();
    if (repetido && repetido.comprobante_id !== factura.id) {
      const otra = (repetido.comprobantes as { numero?: string } | null)?.numero ?? "otra factura";
      return { ok: false, error: `Ese CR ya está registrado en ${otra}. No se carga dos veces.` };
    }
    if (repetido) return { ok: true }; // El mismo, en la misma factura: nada que hacer.

    const ruta = `cr/${factura.id}/${randomUUID()}.${ext}`;
    const { error: errorSubida } = await supabase.storage
      .from(BUCKET_CR)
      .upload(ruta, bytes, { contentType: archivo.type, upsert: false });
    if (errorSubida) return { ok: false, error: `No se pudo subir el archivo: ${errorSubida.message}` };

    const { data: anterior } = await supabase
      .from("comprobante_retenciones")
      .select("ruta")
      .eq("comprobante_id", factura.id)
      .maybeSingle();

    const { error: errorFila } = await supabase.from("comprobante_retenciones").upsert({
      comprobante_id: factura.id,
      ruta,
      nombre: archivo.name.slice(0, 200) || `CR ${factura.numero}.${ext}`,
      mime: archivo.type,
      sha256,
      numero_cr: numero,
      subido_por: perfil.id,
      subido_en: new Date().toISOString(),
    });
    if (errorFila) {
      await supabase.storage.from(BUCKET_CR).remove([ruta]);
      return { ok: false, error: errorFila.message };
    }
    // El de antes, si se cambió, ya no lo apunta nadie.
    if (anterior?.ruta) await supabase.storage.from(BUCKET_CR).remove([anterior.ruta]);

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${factura.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar el CR." };
  }
}

/** Un enlace firmado para abrir el CR, que caduca en diez minutos. */
export async function enlaceCr(comprobanteId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!z.string().uuid().safeParse(comprobanteId).success) return { ok: false, error: "Esa factura no vale." };
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("comprobante_retenciones")
    .select("ruta")
    .eq("comprobante_id", comprobanteId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Esa factura no tiene CR." };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_CR).createSignedUrl(data.ruta, 600);
  if (error || !firmada) return { ok: false, error: error?.message ?? "No se pudo abrir el CR." };
  return { ok: true, url: firmada.signedUrl };
}
