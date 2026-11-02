import "server-only";

import { clienteAdmin } from "@rodatech/db/admin";
import { MENSAJE_SIN_CONEXION } from "@rodatech/sunat";

import { enviarComprobante } from "@/modules/facturacion/api/envio";
import { mandarGuiaASunat, preguntarGuiaASunat } from "@/modules/guias/api/envio-sunat";

/**
 * El reenvío automático a SUNAT (183).
 *
 * Luis, 02/11, el primer día en producción: «la mejor solución y la mejor
 * automatización, sin gastar mucho». Lo que falta lo decide la base
 * (`sunat_por_reintentar`: solo producción, series reales, sin rechazados,
 * con espera creciente y tope); aquí se manda con el MISMO código del botón,
 * así que el candado, el 1033 y el CDR se tratan igual que a mano.
 *
 * Primero las guías que esperan respuesta (preguntar es barato), luego las
 * facturas y al final las notas —SUNAT rechaza la nota de una factura que
 * aún no conoce— y las guías por mandar. Si SUNAT no contesta a uno, no se
 * insiste con los demás en esta vuelta: es la misma caída.
 */

/** Vercel corta a los 60 s; con 25 s por envío, se para a tiempo. */
const PRESUPUESTO_MS = 30_000;

type Lista = {
  comprobantes: { id: string; tipo: string; numero: string; intentos: number }[];
  guias: { id: string; numero: string; intentos: number; que: "mandar" | "preguntar" }[];
};

export type ResumenReintentos = {
  revisados: number;
  aceptados: string[];
  siguenPendientes: string[];
  sinConexion: boolean;
};

const sinRed = (mensaje: string | undefined) =>
  Boolean(mensaje && (mensaje === MENSAJE_SIN_CONEXION || mensaje.startsWith("No se pudo conectar con SUNAT")));

export async function reintentarSunat(): Promise<ResumenReintentos> {
  const admin = clienteAdmin();
  const { data, error } = await admin.rpc("sunat_por_reintentar");
  if (error) throw new Error(error.message);
  const lista = data as unknown as Lista;

  const resumen: ResumenReintentos = { revisados: 0, aceptados: [], siguenPendientes: [], sinConexion: false };
  const inicio = Date.now();
  const hayTiempo = () => !resumen.sinConexion && Date.now() - inicio < PRESUPUESTO_MS;

  // Se cuenta el intento ANTES de hacerlo: si la función muere a mitad, la
  // espera crece igual y no se martillea a SUNAT.
  const contar = (tabla: "comprobantes" | "guias_remision", id: string, intentos: number) =>
    admin.from(tabla).update({ sunat_reintentos_auto: intentos + 1 }).eq("id", id);

  const anotar = (numero: string, ok: boolean, mensaje?: string) => {
    resumen.revisados++;
    (ok ? resumen.aceptados : resumen.siguenPendientes).push(numero);
    if (!ok && sinRed(mensaje)) resumen.sinConexion = true;
  };

  for (const g of lista.guias.filter((x) => x.que === "preguntar")) {
    if (!hayTiempo()) break;
    await contar("guias_remision", g.id, g.intentos);
    const r = await preguntarGuiaASunat(g.id);
    anotar(g.numero, r.ok && r.estado === "aceptada", r.ok ? r.mensaje : r.error);
  }

  const peso = (t: string) => (t === "factura" ? 0 : 1);
  for (const c of [...lista.comprobantes].sort((a, b) => peso(a.tipo) - peso(b.tipo))) {
    if (!hayTiempo()) break;
    await contar("comprobantes", c.id, c.intentos);
    const r = await enviarComprobante(c.id, admin);
    anotar(c.numero, r.ok && r.aceptado, r.ok ? r.mensaje : r.error);
  }

  for (const g of lista.guias.filter((x) => x.que === "mandar")) {
    if (!hayTiempo()) break;
    await contar("guias_remision", g.id, g.intentos);
    const r = await mandarGuiaASunat(g.id, admin);
    anotar(g.numero, r.ok && r.estado === "aceptada", r.ok ? r.mensaje : r.error);
  }

  return resumen;
}
