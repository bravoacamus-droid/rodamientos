import type { Accion, Modulo } from "@/lib/permisos-comun";

import type { Rol } from "./tipos";

/**
 * Los permisos, como se piensan (143): un ROL agrupa lo que puede hacer en
 * cada MÓDULO —ver, crear, editar, eliminar—.
 *
 * Hasta el 20/10 la pantalla enseñaba áreas con un solo «Sí / No / A medias»
 * por rol, y debajo había una matriz tabla×rol. El QA lo vio: el «A medias»
 * no volvía nunca después del primer clic, y quitar un área no cambiaba los
 * botones porque la aplicación tenía su propia lista de roles a mano. Luis:
 * *«los roles y permisos es diferente… se agrupa qué pueden hacer: leer,
 * editar, el CRUD de los módulos»*.
 *
 * Lo que NO está aquí, a propósito:
 *   · Usuarios y esta misma pantalla: solo gerencia, siempre. Dejarlo en la
 *     matriz sería ofrecer un botón para quedarse fuera.
 *   · El ajuste de inventario: `es_gerencia()` en la base (gerencia y
 *     administración), como lo pidió Willy, «un botón que se usa con cuidado».
 */
export interface ModuloDef {
  clave: Modulo;
  nombre: string;
  ayuda: string;
  /** Las acciones que tienen sentido: Reportes solo se ve. */
  acciones: Accion[];
}

/** Una fila de `permisos`: este rol puede esto en este módulo. */
export interface Permiso {
  rol: Rol;
  modulo: Modulo;
  accion: Accion;
}

const clave = (p: Permiso) => `${p.rol}|${p.modulo}|${p.accion}`;

/** ¿Lo tiene? Gerencia lo tiene todo, sin filas. */
export function tiene(
  permisos: readonly Permiso[],
  rol: Rol,
  modulo: Modulo,
  accion: Accion,
): boolean {
  if (rol === "gerencia") return true;
  return permisos.some((p) => p.rol === rol && p.modulo === modulo && p.accion === accion);
}

/**
 * Cómo queda la lista después de un clic. Es la misma regla que aplica
 * `cambiar_permiso` en la base, repetida aquí para que la casilla cambie al
 * instante y no tras la ida y vuelta:
 *
 *   · dar crear/editar/eliminar da también VER: no se crea lo que no se ve;
 *   · quitar VER quita el módulo entero, por lo mismo.
 */
export function aplicarCambio(
  permisos: readonly Permiso[],
  cambio: Permiso & { puede: boolean },
): Permiso[] {
  const { rol, modulo, accion, puede } = cambio;
  if (puede) {
    const nuevos: Permiso[] = [{ rol, modulo, accion }];
    if (accion !== "ver") nuevos.push({ rol, modulo, accion: "ver" });
    const vistas = new Set(permisos.map(clave));
    return [...permisos, ...nuevos.filter((n) => !vistas.has(clave(n)))];
  }
  if (accion === "ver") {
    return permisos.filter((p) => !(p.rol === rol && p.modulo === modulo));
  }
  return permisos.filter((p) => clave(p) !== clave({ rol, modulo, accion }));
}

/**
 * Lo que puede un rol, dicho en una línea para la lista de roles: «Ve 9
 * módulos · cambia 5». Sirve para distinguir de un vistazo un rol que solo
 * mira de uno que trabaja.
 */
export function resumenDelRol(
  permisos: readonly Permiso[],
  modulos: readonly ModuloDef[],
  rol: Rol,
): { ve: number; cambia: number } {
  let ve = 0;
  let cambia = 0;
  for (const m of modulos) {
    if (tiene(permisos, rol, m.clave, "ver")) ve++;
    if ((["crear", "editar", "eliminar"] as const).some((a) => m.acciones.includes(a) && tiene(permisos, rol, m.clave, a))) {
      cambia++;
    }
  }
  return { ve, cambia };
}
