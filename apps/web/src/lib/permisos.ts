import "server-only";

import { cache } from "react";
import { clienteServidor } from "@rodatech/db/servidor";

import { type Accion, type Modulo, avisoSinPermiso } from "./permisos-comun";

export type { Accion, Modulo } from "./permisos-comun";

/**
 * Lo que puede el usuario de esta sesión (143).
 *
 * Hasta el 20/10 cada módulo tenía su lista de roles escrita a mano —
 * `const ROLES = ["gerencia", "admin", "ventas"]` en ~100 archivos— y la base
 * miraba otra matriz. Cambiar un permiso en Configuración no cambiaba los
 * botones, y el QA lo encontró así: *«deja rellenar datos y al intentar
 * guardar no lo permite»*. Ahora las pantallas, las Server Actions y la base
 * preguntan a la misma tabla.
 *
 * Una sola llamada por petición (`cache`): el layout, la página y la acción
 * la comparten.
 */
export interface MisPermisos {
  rol: string | null;
  /** Como se llama el rol en pantalla: «Ventas», o el que creó gerencia. */
  nombreRol: string | null;
  tiene: (modulo: Modulo, accion: Accion) => boolean;
  /** «modulo:accion», para pasárselo a un componente de cliente. */
  lista: string[];
}

export const misPermisos = cache(async (): Promise<MisPermisos> => {
  const supabase = await clienteServidor();
  const { data } = await supabase.rpc("mis_permisos");
  const d = (data ?? null) as { rol?: string; nombre_rol?: string; permisos?: string[] } | null;
  const lista = Array.isArray(d?.permisos) ? d.permisos : [];
  const conjunto = new Set(lista);
  return {
    rol: d?.rol ?? null,
    nombreRol: d?.nombre_rol ?? null,
    tiene: (m, a) => conjunto.has(`${m}:${a}`),
    lista,
  };
});

/** ¿Puede el usuario de esta sesión hacer esto? */
export async function puedo(modulo: Modulo, accion: Accion): Promise<boolean> {
  return (await misPermisos()).tiene(modulo, accion);
}

/**
 * Para la primera línea de una Server Action: null si puede, y si no, la
 * frase que se le enseña. Toda Server Action es un endpoint público: se
 * pregunta aunque la pantalla ya haya escondido el botón.
 */
export async function sinPermiso(modulo: Modulo, accion: Accion): Promise<string | null> {
  const p = await misPermisos();
  if (!p.rol) return "Tu sesión expiró. Vuelve a entrar.";
  return p.tiene(modulo, accion) ? null : avisoSinPermiso(modulo, accion, p.nombreRol);
}
