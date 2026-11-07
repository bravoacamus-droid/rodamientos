"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";
import { sinPermiso } from "@/lib/permisos";
import { claveDireccion as clave } from "../dominio/direccion";

/**
 * Las direcciones de entrega de un cliente (195).
 *
 * Moisés, 06/11: *«que se guarde por cliente… y si hago otra cotización y
 * guía a ese cliente pueda seleccionar una dirección u otra… tiene que ser
 * dinámico con el ubigeo»*. Cada dirección va con su distrito: elegirla pone
 * las dos cosas a la vez, que es lo que faltaba (cambiar la dirección dejaba
 * el distrito del RUC).
 */

export interface DireccionCliente {
  /** null en la fiscal, que no está en la tabla: sale de la ficha del cliente. */
  id: string | null;
  direccion: string;
  ubigeo: string | null;
  /** «Comas · Lima, Lima», para que se lea el distrito sin saberse el código. */
  lugar: string | null;
  fiscal: boolean;
}

const uuid = z.string().uuid();

export async function direccionesDeCliente(
  clienteId: string,
): Promise<{ ok: true; datos: DireccionCliente[] } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  if (!uuid.safeParse(clienteId).success) return { ok: false, error: "Cliente no válido." };

  const supabase = await clienteServidor();
  const [{ data: cliente, error: e1 }, { data: otras, error: e2 }] = await Promise.all([
    supabase.from("clientes").select("direccion, ubigeo_codigo").eq("id", clienteId).maybeSingle(),
    supabase
      .from("cliente_direcciones")
      .select("id, direccion, ubigeo_codigo")
      .eq("cliente_id", clienteId)
      .order("usado_en", { ascending: false })
      .limit(20),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };

  const lista: Omit<DireccionCliente, "lugar">[] = [];
  if (cliente?.direccion?.trim()) {
    lista.push({ id: null, direccion: cliente.direccion.trim(), ubigeo: cliente.ubigeo_codigo ?? null, fiscal: true });
  }
  const claveFiscal = cliente?.direccion ? clave(cliente.direccion) : "";
  for (const o of otras ?? []) {
    if (clave(o.direccion) === claveFiscal) continue;
    lista.push({ id: o.id, direccion: o.direccion, ubigeo: o.ubigeo_codigo ?? null, fiscal: false });
  }

  const codigos = [...new Set(lista.map((d) => d.ubigeo).filter((c): c is string => Boolean(c)))];
  const nombres = new Map<string, string>();
  if (codigos.length > 0) {
    const { data } = await supabase.from("ubigeo").select("codigo, departamento, provincia, distrito").in("codigo", codigos);
    for (const u of data ?? []) nombres.set(String(u.codigo).trim(), `${u.distrito} · ${u.provincia}, ${u.departamento}`);
  }
  return { ok: true, datos: lista.map((d) => ({ ...d, lugar: d.ubigeo ? (nombres.get(d.ubigeo) ?? null) : null })) };
}

/** Quitar una dirección guardada que ya no sirve (mal escrita, local cerrado). */
export async function quitarDireccionCliente(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermiso("guias", "editar");
  if (negado) return { ok: false, error: negado };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dirección no válida." };

  const supabase = await clienteServidor();
  const { error } = await supabase.from("cliente_direcciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/guias");
  return { ok: true };
}
