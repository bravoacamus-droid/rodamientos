"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { detalleGuia } from "../api/consultas";
import { faltaParaEmitir } from "../dominio/emitir";

/**
 * Emitir una guía en borrador: el stock sale del almacén.
 *
 * Desde el 14/10 emite LO QUE LA GUÍA YA DICE. Antes la ventana volvía a
 * pedir el transporte en cajas sueltas —las mismas que se quitaron del
 * formulario (§BS)— y exigía placa siempre, así que una guía «a pie» no se
 * podía emitir. Ahora el transporte y la O/C se ponen con «Editar», y aquí
 * solo se comprueba que estén (`faltaParaEmitir`, la misma regla que enseña
 * la ventana) y se emite.
 */

/** La misma lista que `permisos_rol` tiene para `guias_remision`. */
const ROLES = ["gerencia", "admin", "ventas", "almacen"] as const;

export type ResultadoEmisionGuia = { ok: true; numero: string } | { ok: false; error: string };

export async function emitirGuia(id: string): Promise<ResultadoEmisionGuia> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!ROLES.includes(perfil.rol as (typeof ROLES)[number])) {
    return { ok: false, error: "Tu rol no puede emitir guías." };
  }
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: "Esa guía no es válida." };
  }

  const leida = await detalleGuia(id);
  if (!leida.ok) return { ok: false, error: leida.error };
  if (!leida.datos) return { ok: false, error: "Esa guía ya no existe." };
  const g = leida.datos;
  if (g.estado !== "borrador") {
    return { ok: false, error: "Esta guía ya está emitida o anulada." };
  }

  const falta = faltaParaEmitir(g);
  if (falta.length > 0) {
    return { ok: false, error: `Antes de emitir falta ${falta.join(", ")}. Ponlo con «Editar».` };
  }

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("emitir_guia", { p_id: id });
    if (error) return { ok: false, error: error.message };

    const r = data as unknown as { numero: string };

    revalidatePath("/guias");
    revalidatePath(`/guias/${id}`);
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
