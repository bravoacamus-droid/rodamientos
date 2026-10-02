"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Los documentos de una compra: la proforma confirmada, en PDF (099, §AQ).
 *
 * Willy, 01/10: *«ese documento tiene que estar registrado […] para cualquier
 * cosa que se le pierda»*. El mismo patrón que los papeles de la recepción
 * (068): bucket privado, ruta con uuid propio, enlace de diez minutos.
 */

/** La misma lista que `permisos_rol` tiene para `compra_adjuntos`. */
const ROLES = ["gerencia", "admin", "compras"] as const;

const BUCKET = "documentos-proveedor";
const MAXIMO = 10 * 1024 * 1024;

const TIPOS_OK: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export type ResultadoDocumento = { ok: true } | { ok: false; error: string };

async function exigirRol(): Promise<{ id: string } | string> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Hay que iniciar sesión.";
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return "Tu rol no puede tocar los documentos de una compra.";
  }
  return { id: perfil.id };
}

export async function subirDocumentoCompra(formData: FormData): Promise<ResultadoDocumento> {
  const perfil = await exigirRol();
  if (typeof perfil === "string") return { ok: false, error: perfil };

  const revision = z
    .object({ compra_id: z.string().uuid(), tipo: z.enum(["proforma", "factura", "otro"]) })
    .safeParse({ compra_id: formData.get("compra_id"), tipo: formData.get("tipo") });
  if (!revision.success) return { ok: false, error: "Faltan datos del documento." };
  const { compra_id, tipo } = revision.data;

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No llegó ningún archivo." };
  }
  if (archivo.size > MAXIMO) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope son 10 MB.`,
    };
  }
  const extension = TIPOS_OK[archivo.type];
  if (!extension) return { ok: false, error: "Solo se aceptan PDF o fotos (JPG, PNG, WEBP, HEIC)." };

  try {
    const supabase = await clienteServidor();
    const { data: compra, error: errorLee } = await supabase
      .from("compras")
      .select("id, estado")
      .eq("id", compra_id)
      .maybeSingle();
    if (errorLee) return { ok: false, error: errorLee.message };
    if (!compra) return { ok: false, error: "Esa compra ya no existe." };

    // uuid propio y no el nombre: dos «proforma.pdf» se pisarían.
    const ruta = `compras/${compra_id}/${tipo}-${randomUUID()}.${extension}`;
    const { error: errorSube } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (errorSube) return { ok: false, error: errorSube.message };

    const { error: errorApunta } = await supabase.from("compra_adjuntos").insert({
      compra_id,
      tipo,
      ruta,
      nombre: archivo.name.slice(0, 200),
      tamano_bytes: archivo.size,
      mime: archivo.type,
      subido_por: perfil.id,
    });
    if (errorApunta) {
      // Sin la fila, el archivo quedaría huérfano ocupando espacio.
      await supabase.storage.from(BUCKET).remove([ruta]);
      return { ok: false, error: errorApunta.message };
    }

    revalidatePath(`/compras/${compra_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el archivo." };
  }
}

export async function quitarDocumentoCompra(id: string): Promise<ResultadoDocumento> {
  const perfil = await exigirRol();
  if (typeof perfil === "string") return { ok: false, error: perfil };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Ese documento no vale." };

  try {
    const supabase = await clienteServidor();
    const { data: adj, error } = await supabase
      .from("compra_adjuntos")
      .select("ruta, compra_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!adj) return { ok: true };

    // Primero la fila, después el archivo (068).
    const { error: errorFila } = await supabase.from("compra_adjuntos").delete().eq("id", id);
    if (errorFila) return { ok: false, error: errorFila.message };
    await supabase.storage.from(BUCKET).remove([String(adj.ruta)]);

    revalidatePath(`/compras/${String(adj.compra_id)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo quitar el documento." };
  }
}

/** Enlace de diez minutos. Entra el id, la ruta la pone la base (auditoría 11/09). */
export async function enlaceDocumentoCompra(
  id: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const perfil = await exigirRol();
  if (typeof perfil === "string") return { ok: false, error: perfil };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "El documento no es válido." };

  try {
    const supabase = await clienteServidor();
    const { data: fila, error } = await supabase
      .from("compra_adjuntos")
      .select("ruta")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!fila?.ruta) return { ok: false, error: "Ese documento ya no está." };
    const { data, error: errorUrl } = await supabase.storage.from(BUCKET).createSignedUrl(fila.ruta, 600);
    if (errorUrl || !data?.signedUrl) return { ok: false, error: errorUrl?.message ?? "No se pudo abrir." };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo abrir el documento." };
  }
}
