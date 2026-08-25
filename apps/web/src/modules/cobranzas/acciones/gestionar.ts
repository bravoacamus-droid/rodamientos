"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { cuotasDe as leerCuotas } from "../api/consultas";

/**
 * Registra una gestión de cobranza: la llamada, el WhatsApp, la promesa.
 *
 * Lo importante no es el registro por sí mismo, es el **compromiso**: alguien
 * dijo que pagaba tal día. Sin apuntarlo, la promesa se olvida y la gestión se
 * pierde — que es justo lo que pasa cuando el seguimiento vive en la cabeza
 * del que llamó.
 *
 * `gestiones_cobranza` no tiene RPC porque no lo necesita: es un insert simple
 * y RLS ya decide quién puede escribir. La política pregunta a `permisos_rol`,
 * igual que el resto.
 */

/** La misma lista que `permisos_rol` tiene para `gestiones_cobranza`. */
const ROLES = ["gerencia", "admin", "cobranzas"] as const;

const esquema = z.object({
  cliente_id: z.string().uuid(),
  comprobante_id: z.string().uuid().nullable(),
  canal: z.enum(["whatsapp", "llamada", "correo", "visita", "otro"]),
  resultado: z.string().max(200).nullable(),
  compromiso_fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de compromiso no es válida.")
    .nullable(),
  nota: z.string().max(2000).nullable(),
});

export type ResultadoGestion =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function registrarGestion(
  _previo: ResultadoGestion | null,
  formData: FormData,
): Promise<ResultadoGestion> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede registrar gestiones de cobranza." };
  }

  const crudo = formData.get("gestion");
  if (typeof crudo !== "string") {
    return { ok: false, error: "No llegaron los datos de la gestión." };
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(JSON.parse(crudo));
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0]?.message : "formato inesperado";
    return { ok: false, error: `Los datos no son válidos: ${detalle}.` };
  }

  // Una gestión sin nota ni compromiso no aporta nada: es una fila que dice
  // «alguien llamó». Se exige al menos una de las dos.
  if (!datos.nota?.trim() && !datos.compromiso_fecha) {
    return {
      ok: false,
      error: "Apunta al menos qué dijo el cliente, o para cuándo se comprometió.",
    };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("gestiones_cobranza")
      .insert({
        cliente_id: datos.cliente_id,
        comprobante_id: datos.comprobante_id,
        canal: datos.canal,
        resultado: datos.resultado,
        compromiso_fecha: datos.compromiso_fecha,
        nota: datos.nota,
        usuario_id: perfil.id,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath("/cobranzas");
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar la gestión.",
    };
  }
}

/**
 * Trae las cuotas de un comprobante para previsualizar el reparto.
 *
 * Envoltura de la consulta de `api/`, que es `server-only`: el cobrador la pide
 * al vuelo, al elegir el documento.
 */
export async function cuotasDelComprobante(comprobanteId: string) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  return leerCuotas(comprobanteId);
}
