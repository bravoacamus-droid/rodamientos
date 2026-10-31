"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";

import { BUCKET_CR, guardarCr, prepararCr, revisarCr } from "./archivo-cr";

/**
 * El comprobante de retención (CR) de una factura (120).
 *
 * Willy, 14/10: los CR le llegan por correo en PDF —o no llegan— y al cabo
 * del año tenía S/ 5 000 retenidos sin declarar. Aquí se cuelga cada uno de
 * su factura; el mismo PDF no entra en dos (la base lo impide por su huella,
 * `sha256`), y se dice en cuál está.
 */

/** Quien toca los cobros: la misma lista que `permisos_rol` tiene para `pagos`. */
export type ResultadoCr = { ok: true } | { ok: false; error: string };

export async function registrarCr(formData: FormData): Promise<ResultadoCr> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = (await sinPermiso("facturacion", "editar")) && (await sinPermiso("cobranzas", "crear"));
  if (negado) {
    return { ok: false, error: negado };
  }

  const id = formData.get("comprobante_id");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Esa factura no vale." };
  const numero = String(formData.get("numero_cr") ?? "").trim().slice(0, 40) || null;
  const archivo = revisarCr(formData.get("archivo"));
  if (archivo === null) return { ok: false, error: "No llegó ningún archivo." };
  if (typeof archivo === "string") return { ok: false, error: archivo };

  try {
    const supabase = await clienteServidor();
    const { data: factura, error: errorFactura } = await supabase
      .from("comprobantes")
      .select("id, numero, retencion_aplica, estado")
      .eq("id", id as string)
      .maybeSingle();
    if (errorFactura) return { ok: false, error: errorFactura.message };
    if (!factura) return { ok: false, error: "Esa factura ya no existe." };
    // Las facturas cargadas del Excel nacieron sin retención aunque el
    // cliente retenga, y una factura emitida no se modifica (31/10). Si al
    // cobrarla se registró una retención, la tuvo, y lleva su CR.
    if (!factura.retencion_aplica) {
      const { count } = await supabase
        .from("pagos")
        .select("id", { count: "exact", head: true })
        .eq("comprobante_id", factura.id)
        .eq("medio", "retencion");
      if (!count) {
        return {
          ok: false,
          error: `${factura.numero} no tiene retención: no lleva CR. Si el cliente retuvo, registra primero la retención al cobrarla.`,
        };
      }
    }

    const preparado = await prepararCr(supabase, archivo, factura.id);
    if (preparado === "mismo") return { ok: true }; // El mismo, en la misma factura: nada que hacer.
    if (typeof preparado === "string") return { ok: false, error: preparado };
    const guardado = await guardarCr(supabase, {
      facturaId: factura.id,
      facturaNumero: factura.numero ?? "",
      archivo,
      preparado,
      numeroCr: numero,
      perfilId: perfil.id,
    });
    if (guardado !== true) return { ok: false, error: guardado };

    revalidatePath("/facturacion");
    revalidatePath(`/facturacion/${factura.id}`);
    revalidatePath("/cobranzas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar el CR." };
  }
}

/**
 * Un enlace firmado para abrir el CR, que caduca en diez minutos. Con
 * `descargar`, el navegador lo baja con su nombre en vez de abrirlo (31/10:
 * Willy lo guarda para el contador).
 */
export async function enlaceCr(
  comprobanteId: string,
  descargar = false,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!z.string().uuid().safeParse(comprobanteId).success) return { ok: false, error: "Esa factura no vale." };
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("comprobante_retenciones")
    .select("ruta, nombre")
    .eq("comprobante_id", comprobanteId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Esa factura no tiene CR." };
  const { data: firmada, error } = await supabase.storage
    .from(BUCKET_CR)
    .createSignedUrl(data.ruta, 600, descargar ? { download: data.nombre || true } : undefined);
  if (error || !firmada) return { ok: false, error: error?.message ?? "No se pudo abrir el CR." };
  return { ok: true, url: firmada.signedUrl };
}
