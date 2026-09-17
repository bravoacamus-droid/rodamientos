"use server";

import { usuarioActual } from "@rodatech/db/servidor";

import { cotizacionParaFacturar, guiasDelCliente } from "../api/consultas";

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

/**
 * Las guías del cliente, para el «+» de la factura.
 *
 * Misma envoltura y mismo motivo que `cargarCotizacion`: la consulta vive en
 * `api/`, que es `server-only`, y esto se pide al vuelo desde el navegador
 * cuando alguien abre el buscador de guías.
 */
export async function buscarGuiasDelCliente(clienteId: string) {
  if ((await usuarioActual()) === null) {
    return { ok: false as const, error: "Sesión expirada." };
  }
  return guiasDelCliente(clienteId);
}
