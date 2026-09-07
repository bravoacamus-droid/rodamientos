"use server";

import { usuarioActual } from "@rodatech/db/servidor";

import { quienEsperaEstos } from "../api/por-comprar";
import type { QuienEsperaProducto } from "../dominio/listos";

/**
 * Quién está esperando estos productos, preguntado al vuelo.
 *
 * La consulta vive en `api/`, que es `server-only`. Esta envoltura existe
 * porque el constructor la necesita **mientras se arma la compra**: se añade un
 * producto a mano, o se cambia una cantidad, y el aviso tiene que moverse con
 * ello.
 *
 * Pedirlo solo al cargar la pantalla —como se hacía— dejaba sin aviso todo lo
 * que no viniera precargado de la bandeja, que es justo el caso en el que más
 * falta hace: el que compra a ojo.
 */
export async function quienEsperaAhora(
  productoIds: string[],
): Promise<{ ok: true; datos: Record<string, QuienEsperaProducto> } | { ok: false }> {
  if ((await usuarioActual()) === null) return { ok: false };
  if (productoIds.length === 0) return { ok: true, datos: {} };
  return { ok: true, datos: await quienEsperaEstos(productoIds.slice(0, 150)) };
}
