"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clienteServidor, perfilActual } from "@rodatech/db/servidor";

import { mensajeDeError } from "@/lib/errores";
import { ACCIONES, type Accion } from "@/lib/permisos-comun";

/**
 * Cambiar permisos y roles (143). Solo gerencia.
 *
 * Las reglas viven en la base —`cambiar_permiso`, `crear_rol`,
 * `renombrar_rol`, `eliminar_rol`— y dicen sus porqués en frases para leer:
 * «Lo tienen 2 usuarios: cámbiales el rol antes de eliminarlo». Aquí se
 * valida la forma y se comprueba el rol antes de ir, porque esto es un
 * endpoint público y un error de RLS en crudo no le sirve a nadie.
 *
 * Por qué solo gerencia y no también administración: quien cambia los
 * permisos podría dárselos todos a sí mismo. Es la misma regla que el cambio
 * de rol de un usuario (077).
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function soloGerencia(): Promise<string | null> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return "Tu sesión expiró. Vuelve a entrar.";
  if (perfil.rol !== "gerencia") return "Los roles y los permisos solo los cambia Gerencia.";
  return null;
}

async function llamar<T>(rpc: string, args: Record<string, unknown>): Promise<Resultado<T>> {
  const no = await soloGerencia();
  if (no) return { ok: false, error: no };
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc(rpc as never, args as never);
    // El mensaje de la base tal cual: lo escribe la 143 para leerlo.
    if (error) return { ok: false, error: error.message || mensajeDeError(error) };
    revalidatePath("/configuracion/permisos");
    revalidatePath("/configuracion/usuarios");
    return { ok: true, datos: data as T };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

const claveRol = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "Ese rol no es válido.");
const nombreRol = z
  .string()
  .trim()
  .min(2, "Ponle un nombre al rol.")
  .max(40, "El nombre es demasiado largo: 40 letras como mucho.");
const descripcion = z.string().trim().max(200, "La descripción es demasiado larga.").optional();

function invalido(e: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: e.issues[0]?.message ?? "Los datos no son válidos." };
}

const esquemaCambio = z.object({
  rol: claveRol,
  modulo: z.string().regex(/^[a-z_]{2,40}$/),
  accion: z.enum(ACCIONES as unknown as [Accion, ...Accion[]]),
  puede: z.boolean(),
});

/** Da o quita UNA acción de un módulo a un rol. Devuelve cómo quedó el módulo. */
export async function cambiarPermiso(entrada: z.input<typeof esquemaCambio>): Promise<Resultado<Accion[]>> {
  const d = esquemaCambio.safeParse(entrada);
  if (!d.success) return invalido(d.error);
  if (d.data.rol === "gerencia") {
    return { ok: false, error: "Gerencia lo puede todo siempre: no se le quitan permisos." };
  }
  return llamar<Accion[]>("cambiar_permiso", {
    p_rol: d.data.rol,
    p_modulo: d.data.modulo,
    p_accion: d.data.accion,
    p_puede: d.data.puede,
  });
}

type RolCreado = { clave: string; nombre: string; descripcion: string | null };

export async function crearRol(entrada: {
  nombre: string;
  descripcion?: string;
  copiarDe?: string | null;
}): Promise<Resultado<RolCreado>> {
  const n = nombreRol.safeParse(entrada.nombre);
  if (!n.success) return invalido(n.error);
  const ds = descripcion.safeParse(entrada.descripcion);
  if (!ds.success) return invalido(ds.error);
  const copiar = entrada.copiarDe ? claveRol.safeParse(entrada.copiarDe) : null;
  if (copiar && !copiar.success) return invalido(copiar.error);
  return llamar<RolCreado>("crear_rol", {
    p_nombre: n.data,
    p_descripcion: ds.data ?? null,
    p_copiar_de: copiar?.data ?? null,
  });
}

export async function renombrarRol(entrada: {
  clave: string;
  nombre: string;
  descripcion?: string;
}): Promise<Resultado<RolCreado>> {
  const c = claveRol.safeParse(entrada.clave);
  if (!c.success) return invalido(c.error);
  const n = nombreRol.safeParse(entrada.nombre);
  if (!n.success) return invalido(n.error);
  const ds = descripcion.safeParse(entrada.descripcion);
  if (!ds.success) return invalido(ds.error);
  return llamar<RolCreado>("renombrar_rol", {
    p_clave: c.data,
    p_nombre: n.data,
    p_descripcion: ds.data ?? null,
  });
}

export async function eliminarRol(clave: string): Promise<Resultado<null>> {
  const c = claveRol.safeParse(clave);
  if (!c.success) return invalido(c.error);
  return llamar<null>("eliminar_rol", { p_clave: c.data });
}
