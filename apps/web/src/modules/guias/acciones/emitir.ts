"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

/**
 * Emite la guía: **es aquí donde la mercadería deja el almacén**.
 *
 * `emitir_guia()` cambia el estado y escribe los movimientos de salida en el
 * kardex de una sola vez. No hay vuelta atrás con un botón: deshacer una
 * salida de stock es un ajuste de inventario, con su motivo y su responsable.
 *
 * Antes de emitir, la base exige los datos del transporte
 * (`guia_transporte_ok`), que es justo lo que el borrador permitía dejar a
 * medias.
 */

const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

const esquemaTransporte = z.object({
  id: z.string().uuid(),
  modalidad_traslado: z.enum(["01", "02"]),
  transportista_documento: z.string().max(15).nullable(),
  transportista_razon_social: z.string().max(200).nullable(),
  transportista_placa: z.string().max(15).nullable(),
  conductor_documento: z.string().max(15).nullable(),
  conductor_nombre: z.string().max(200).nullable(),
  conductor_licencia: z.string().max(20).nullable(),
});

export type ResultadoEmisionGuia =
  | { ok: true; numero: string }
  | { ok: false; error: string };

export async function emitirGuia(
  _previo: ResultadoEmisionGuia | null,
  formData: FormData,
): Promise<ResultadoEmisionGuia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede emitir guías." };
  }

  const crudo = formData.get("transporte");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos del transporte." };
  }

  let datos: z.infer<typeof esquemaTransporte>;
  try {
    datos = esquemaTransporte.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // Lo mismo que exige `guia_transporte_ok`, comprobado aquí para dar un
  // mensaje que se entienda. La restricción de Postgres diría «viola la
  // restricción guia_transporte_ok», que no le dice nada a nadie.
  if (datos.modalidad_traslado === "01" && !datos.transportista_documento?.trim()) {
    return {
      ok: false,
      error: "En transporte público hace falta el RUC del transportista.",
    };
  }
  if (datos.modalidad_traslado === "02" && !datos.transportista_placa?.trim()) {
    return {
      ok: false,
      error: "En transporte privado hace falta la placa del vehículo.",
    };
  }

  try {
    const supabase = await clienteServidor();

    // Primero se completan los datos del transporte, y después se emite. En
    // este orden: si se emitiera antes, la restricción saltaría porque la
    // guía deja de ser borrador con los campos todavía vacíos.
    const { error: errorDatos } = await supabase
      .from("guias_remision")
      .update({
        modalidad_traslado: datos.modalidad_traslado,
        transportista_documento: datos.transportista_documento,
        transportista_razon_social: datos.transportista_razon_social,
        transportista_placa: datos.transportista_placa,
        conductor_documento: datos.conductor_documento,
        conductor_nombre: datos.conductor_nombre,
        conductor_licencia: datos.conductor_licencia,
      })
      .eq("id", datos.id)
      .eq("estado", "borrador");

    if (errorDatos) return { ok: false, error: errorDatos.message };

    const { data, error } = await supabase.rpc("emitir_guia", { p_id: datos.id });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { numero: string };

    revalidatePath("/guias");
    revalidatePath(`/guias/${datos.id}`);
    // El stock acaba de salir: todo lo que lo enseña queda obsoleto ya.
    revalidatePath("/productos");
    revalidatePath("/inventario");
    revalidatePath("/reportes");
    revalidatePath("/dashboard");

    return { ok: true, numero: String(r.numero) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo emitir la guía.",
    };
  }
}
