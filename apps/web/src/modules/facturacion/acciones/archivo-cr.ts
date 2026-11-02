import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { clienteServidor } from "@rodatech/db/servidor";

/**
 * Guardar el comprobante de retención (CR) de una factura (120).
 *
 * Fuera de un archivo "use server" a propósito, como el voucher: lo usan dos
 * acciones —«Registrar CR» y cobrar con el CR en la mano (31/10)— y una
 * función exportada desde "use server" sería un endpoint más, que sube
 * archivos sin mirar el rol. Quien llama ya miró el rol y que la factura
 * lleve retención.
 */

const BUCKET_CR = "comprobantes-retencion";
const MAXIMO = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/** `null` si no vino ningún archivo; un texto si vino y no vale. */
export function revisarCr(archivo: FormDataEntryValue | null): File | string | null {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  if (archivo.size > MAXIMO) return "El CR pasa de 10 MB.";
  if (!TIPOS[archivo.type]) return "El CR tiene que ser un PDF o una foto (JPG, PNG, WEBP).";
  return archivo;
}

export interface CrPreparado {
  bytes: Buffer;
  sha256: string;
  ext: string;
}

/**
 * Lee el archivo y mira que no esté ya en OTRA factura (la base lo impide por
 * su huella, `sha256`; aquí se dice en cuál, antes de subir nada). `"mismo"`
 * si ya está en esta misma: no hay nada que hacer.
 */
export async function prepararCr(
  supabase: Cliente,
  archivo: File,
  facturaId: string,
): Promise<CrPreparado | "mismo" | string> {
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: repetido } = await supabase
    .from("comprobante_retenciones")
    .select("comprobante_id, comprobantes(numero)")
    .eq("sha256", sha256)
    .maybeSingle();
  if (repetido && repetido.comprobante_id !== facturaId) {
    const otra = (repetido.comprobantes as { numero?: string } | null)?.numero ?? "otra factura";
    return `Ese CR ya está registrado en ${otra}. No se carga dos veces.`;
  }
  if (repetido) return "mismo";
  return { bytes, sha256, ext: TIPOS[archivo.type] as string };
}

/** Sube el CR y lo cuelga de su factura; el de antes, si había, se borra. */
export async function guardarCr(
  supabase: Cliente,
  datos: {
    facturaId: string;
    facturaNumero: string;
    archivo: File;
    preparado: CrPreparado;
    numeroCr: string | null;
    perfilId: string;
  },
): Promise<true | string> {
  const { facturaId, facturaNumero, archivo, preparado, numeroCr, perfilId } = datos;
  const ruta = `cr/${facturaId}/${randomUUID()}.${preparado.ext}`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_CR)
    .upload(ruta, preparado.bytes, { contentType: archivo.type, upsert: false });
  if (errorSubida) return `No se pudo subir el archivo: ${errorSubida.message}`;

  const { data: anterior } = await supabase
    .from("comprobante_retenciones")
    .select("ruta")
    .eq("comprobante_id", facturaId)
    .maybeSingle();

  const { error: errorFila } = await supabase.from("comprobante_retenciones").upsert({
    comprobante_id: facturaId,
    ruta,
    nombre: archivo.name.slice(0, 200) || `CR ${facturaNumero}.${preparado.ext}`,
    mime: archivo.type,
    sha256: preparado.sha256,
    numero_cr: numeroCr,
    subido_por: perfilId,
    subido_en: new Date().toISOString(),
  });
  if (errorFila) {
    await supabase.storage.from(BUCKET_CR).remove([ruta]);
    return errorFila.message;
  }
  // El de antes, si se cambió, ya no lo apunta nadie.
  if (anterior?.ruta) await supabase.storage.from(BUCKET_CR).remove([anterior.ruta]);
  return true;
}

export { BUCKET_CR };
