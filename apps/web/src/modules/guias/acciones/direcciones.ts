"use server";

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
  /** Por partes, para abrir la cascada del distrito al editar. */
  departamento: string;
  provincia: string;
  distrito: string;
  fiscal: boolean;
}

const uuid = z.string().uuid();

/**
 * Quien hace guías o quien edita clientes (06/11): la ventana sale en las dos
 * pantallas. Lo mismo dicen las políticas de la tabla (197).
 */
async function sinPermisoDirecciones(): Promise<string | null> {
  for (const [m, a] of [["guias", "crear"], ["guias", "editar"], ["clientes", "editar"]] as const) {
    if (!(await sinPermiso(m, a))) return null;
  }
  return sinPermiso("clientes", "editar");
}

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
      .limit(100),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };

  const lista: Pick<DireccionCliente, "id" | "direccion" | "ubigeo" | "fiscal">[] = [];
  if (cliente?.direccion?.trim()) {
    lista.push({ id: null, direccion: cliente.direccion.trim(), ubigeo: cliente.ubigeo_codigo ?? null, fiscal: true });
  }
  const claveFiscal = cliente?.direccion ? clave(cliente.direccion) : "";
  for (const o of otras ?? []) {
    if (clave(o.direccion) === claveFiscal) continue;
    lista.push({ id: o.id, direccion: o.direccion, ubigeo: o.ubigeo_codigo ?? null, fiscal: false });
  }

  const codigos = [...new Set(lista.map((d) => d.ubigeo).filter((c): c is string => Boolean(c)))];
  const nombres = new Map<string, { departamento: string; provincia: string; distrito: string }>();
  if (codigos.length > 0) {
    const { data } = await supabase.from("ubigeo").select("codigo, departamento, provincia, distrito").in("codigo", codigos);
    for (const u of data ?? []) {
      nombres.set(String(u.codigo).trim(), { departamento: u.departamento, provincia: u.provincia, distrito: u.distrito });
    }
  }
  return {
    ok: true,
    datos: lista.map((d) => {
      const n = d.ubigeo ? nombres.get(d.ubigeo) : undefined;
      return {
        ...d,
        lugar: n ? `${n.distrito} · ${n.provincia}, ${n.departamento}` : null,
        departamento: n?.departamento ?? "",
        provincia: n?.provincia ?? "",
        distrito: n?.distrito ?? "",
      };
    }),
  };
}

const datosDireccion = z.object({
  direccion: z.string().trim().min(3, "Escribe la dirección.").max(300, "La dirección es demasiado larga."),
  ubigeo: z.string().regex(/^[0-9]{6}$/, "Elige el distrito.").nullable(),
});

/** Con la lista ya actualizada: la ventana la pinta sin volver a pedirla. */
type Resultado = { ok: true; datos: DireccionCliente[] } | { ok: false; error: string };

async function listaDespues(clienteId: string): Promise<Resultado> {
  const r = await direccionesDeCliente(clienteId);
  return r.ok ? r : { ok: false, error: r.error };
}

/** El mensaje de la base, en cristiano: la dirección repetida es lo único esperable. */
const mensaje = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "Esa dirección ya está guardada para este cliente." : e.message;

/**
 * Añadir una dirección desde la ventana «Direcciones» (06/11). Moisés: *«que
 * se abra un modal y guardar, editar o borrar»*.
 */
export async function crearDireccionCliente(
  clienteId: string,
  datos: { direccion: string; ubigeo: string | null },
): Promise<Resultado> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermisoDirecciones();
  if (negado) return { ok: false, error: negado };
  if (!uuid.safeParse(clienteId).success) return { ok: false, error: "Cliente no válido." };
  const r = datosDireccion.safeParse(datos);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Los datos no son válidos." };

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("cliente_direcciones")
    .insert({ cliente_id: clienteId, direccion: r.data.direccion, ubigeo_codigo: r.data.ubigeo });
  if (error) return { ok: false, error: mensaje(error) };
  return listaDespues(clienteId);
}

/** Corregir una dirección guardada: la calle, el distrito o los dos. */
export async function editarDireccionCliente(
  id: string,
  datos: { direccion: string; ubigeo: string | null },
): Promise<Resultado> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermisoDirecciones();
  if (negado) return { ok: false, error: negado };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dirección no válida." };
  const r = datosDireccion.safeParse(datos);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Los datos no son válidos." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("cliente_direcciones")
    .update({ direccion: r.data.direccion, ubigeo_codigo: r.data.ubigeo })
    .eq("id", id)
    .select("cliente_id")
    .maybeSingle();
  if (error) return { ok: false, error: mensaje(error) };
  if (!data) return { ok: false, error: "Esa dirección ya no existe." };
  return listaDespues(data.cliente_id);
}

/** Quitar una dirección guardada que ya no sirve (mal escrita, local cerrado). */
export async function quitarDireccionCliente(id: string): Promise<Resultado> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return { ok: false, error: "Hay que iniciar sesión." };
  const negado = await sinPermisoDirecciones();
  if (negado) return { ok: false, error: negado };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dirección no válida." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("cliente_direcciones")
    .delete()
    .eq("id", id)
    .select("cliente_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Esa dirección ya no existe." };
  return listaDespues(data.cliente_id);
}
