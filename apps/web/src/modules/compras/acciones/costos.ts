"use server";

import { usuarioActual } from "@rodatech/db/servidor";

import { ultimosCostosDelProveedor } from "../api/consultas";

/**
 * Últimos costos pactados con un proveedor.
 *
 * La consulta vive en `api/`, que es `server-only`. Esta envoltura existe
 * porque el constructor la pide al VUELO, cuando el operador cambia de
 * proveedor a mitad del registro, y eso solo se puede hacer desde el navegador
 * con una Server Action.
 *
 * Es la pregunta de siempre al comprar: *«¿esto no me lo cobraba más barato?»*.
 */
export async function costosDelProveedor(proveedorId: string) {
  if ((await usuarioActual()) === null) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  return ultimosCostosDelProveedor(proveedorId);
}
