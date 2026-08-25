"use server";

import { usuarioActual } from "@rodatech/db/servidor";

import { cotizacionParaDespachar } from "../api/consultas";

/**
 * Trae una cotización con lo que falta por despachar de cada línea.
 *
 * La consulta vive en `api/`, que es `server-only`. Esta envoltura existe
 * porque el constructor la pide al VUELO, cuando el operador elige la
 * cotización en el desplegable.
 *
 * Lo despachado se recalcula aquí y no se arrastra del listado: es lo que
 * impide sacar del almacén algo que ya salió en una guía anterior.
 */
export async function cargarCotizacion(id: string) {
  if ((await usuarioActual()) === null) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  return cotizacionParaDespachar(id);
}
