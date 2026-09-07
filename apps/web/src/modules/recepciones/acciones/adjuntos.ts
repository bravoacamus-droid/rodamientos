"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Guardar la guía y la factura del proveedor, escaneadas.
 *
 * Willy, 07/09 (29:27): *«siempre nos atienden con guía y factura»* — *«¿quiere
 * subir su guía y su factura también?»* — *«claro»*.
 *
 * Los NÚMEROS ya se apuntan al recibir. Esto es el papel: lo que se mira
 * cuando el proveedor dice que costaba otra cosa, o cuando el contador pide el
 * sustento de una compra de hace ocho meses.
 *
 * ---------------------------------------------------------------------------
 * Qué se comprueba aquí y qué en la base
 * ---------------------------------------------------------------------------
 * Aquí: el rol, que la recepción exista y no esté anulada, el tipo de archivo
 * y el tamaño. En la base: el bucket vuelve a limitar tipo y tamaño, y la RLS
 * vuelve a comprobar el rol.
 *
 * No es duplicación por descuido. Una Server Action es un endpoint público:
 * cualquiera con sesión puede llamarla con lo que quiera. Comprobar aquí da un
 * mensaje que se entiende; comprobar allí es lo que de verdad no se puede
 * saltar.
 */

/** La misma lista que `permisos_rol` tiene para `recepcion_adjuntos`. */
const ROLES = ["gerencia", "admin", "almacen", "compras"] as const;

const BUCKET = "documentos-proveedor";
const MAXIMO = 10 * 1024 * 1024;

const TIPOS_OK: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const esquema = z.object({
  recepcion_id: z.string().uuid(),
  tipo: z.enum(["guia", "factura", "otro"]),
});

export type ResultadoAdjunto = { ok: true } | { ok: false; error: string };

export async function subirPapelDelProveedor(
  formData: FormData,
): Promise<ResultadoAdjunto> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede adjuntar papeles a una recepción." };
  }

  const revision = esquema.safeParse({
    recepcion_id: formData.get("recepcion_id"),
    tipo: formData.get("tipo"),
  });
  if (!revision.success) return { ok: false, error: "Faltan datos del adjunto." };
  const { recepcion_id, tipo } = revision.data;

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No llegó ningún archivo." };
  }
  if (archivo.size > MAXIMO) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope son 10 MB. Si es una foto, sácala con menos calidad.`,
    };
  }
  const extension = TIPOS_OK[archivo.type];
  if (!extension) {
    return { ok: false, error: "Solo se aceptan PDF o fotos (JPG, PNG, WEBP, HEIC)." };
  }

  try {
    const supabase = await clienteServidor();

    // Que la recepción exista y no esté anulada. Colgar el papel de una
    // recepción anulada lo deja donde nadie lo va a mirar.
    const { data: rec, error: errorLee } = await supabase
      .from("recepciones")
      .select("id, numero, anulada")
      .eq("id", recepcion_id)
      .maybeSingle();

    if (errorLee) return { ok: false, error: errorLee.message };
    if (!rec) return { ok: false, error: "Esa recepción ya no existe." };
    if (rec.anulada) {
      return {
        ok: false,
        error: "La recepción está anulada: no se le adjuntan papeles.",
      };
    }

    /*
      La ruta lleva un uuid propio, NO el nombre del archivo.

      Dos móviles distintos mandan «IMG_0001.jpg», y con el nombre original el
      segundo machacaría al primero sin avisar. El nombre de verdad se guarda
      en la tabla, que es donde sirve para enseñarlo.
    */
    const ruta = `${recepcion_id}/${tipo}-${randomUUID()}.${extension}`;

    const { error: errorSube } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

    if (errorSube) return { ok: false, error: errorSube.message };

    const { error: errorApunta } = await supabase.from("recepcion_adjuntos").insert({
      recepcion_id,
      tipo,
      ruta,
      nombre: archivo.name.slice(0, 200),
      tamano_bytes: archivo.size,
      mime: archivo.type,
      subido_por: perfil.id,
    });

    if (errorApunta) {
      // El archivo ya está arriba y la fila no: sin esto quedaría un huérfano
      // ocupando espacio que nadie sabe de dónde salió.
      await supabase.storage.from(BUCKET).remove([ruta]);
      return { ok: false, error: errorApunta.message };
    }

    revalidatePath(`/recepciones/${recepcion_id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el archivo.",
    };
  }
}

/**
 * Quitar un papel mal subido.
 *
 * Se permite borrar, a diferencia del resto del ERP, porque aquí no se destruye
 * un hecho contable: se quita una foto movida o el papel que no era. El hecho
 * —que se recibió, a quién y a cuánto— vive en `recepciones` y no se toca.
 */
export async function quitarPapelDelProveedor(id: string): Promise<ResultadoAdjunto> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede quitar papeles." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Ese adjunto no vale." };
  }

  try {
    const supabase = await clienteServidor();
    const { data: adj, error } = await supabase
      .from("recepcion_adjuntos")
      .select("ruta, recepcion_id")
      .eq("id", id)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!adj) return { ok: true };

    // Primero la fila y después el archivo: al revés, un fallo dejaría la fila
    // apuntando a un archivo que ya no está, que es peor que un archivo suelto.
    const { error: errorFila } = await supabase
      .from("recepcion_adjuntos")
      .delete()
      .eq("id", id);
    if (errorFila) return { ok: false, error: errorFila.message };

    await supabase.storage.from(BUCKET).remove([String(adj.ruta)]);

    revalidatePath(`/recepciones/${String(adj.recepcion_id)}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo quitar el archivo.",
    };
  }
}

/**
 * Un enlace temporal para ver el papel.
 *
 * El bucket es privado a propósito: una factura de compra lleva el RUC del
 * proveedor y los precios a los que compra Rodatech. Un bucket público sería
 * una URL que adivina cualquiera y que no caduca nunca.
 *
 * Diez minutos: lo que se tarda en mirarlo o descargarlo, y no lo bastante
 * para que el enlace sirva de algo si acaba pegado en un chat.
 */
export async function enlaceAlPapel(
  ruta: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, 600);

    if (error) return { ok: false, error: error.message };
    if (!data?.signedUrl) return { ok: false, error: "No se pudo abrir el archivo." };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo abrir el archivo.",
    };
  }
}
