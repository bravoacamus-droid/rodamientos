"use server";

import { usuarioActual } from "@rodatech/db/servidor";

import { cotizacionParaFacturar } from "../api/consultas";

/**
 * Trae una cotización entera para previsualizar el comprobante.
 *
 * La consulta vive en `api/`, que es `server-only`. Esta envoltura existe
 * porque el emisor la pide al VUELO, cuando el operador elige la cotización en
 * el desplegable, y eso solo se puede hacer desde el navegador con una Server
 * Action.
 *
 * Los importes se releen aquí y no se arrastran del listado a propósito: lo
 * que va a acabar en un documento fiscal no viaja por el navegador.
 */
export async function cargarCotizacion(id: string) {
  if ((await usuarioActual()) === null) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  return cotizacionParaFacturar(id);
}
