/**
 * La bandeja de SUNAT: qué falta mandar, qué rechazó y qué bajas faltan
 * comunicar (15/10).
 *
 * Luis: *«un módulo para que me avise ahí las que todavía no manda… y ver
 * los estados si fue rechazado o así, más que todo es para el cliente»*.
 * Hasta hoy eso era un filtro escondido en Facturación, y Willy no iba a
 * entrar a buscarlo.
 *
 * Puro: sin reloj ni base. La fecha de hoy entra como argumento.
 */

export type TipoDocumentoSunat = "factura" | "boleta" | "nota_credito" | "nota_debito";

export interface DocumentoBandeja {
  id: string;
  tipo: TipoDocumentoSunat;
  numero: string;
  cliente: string;
  fecha_emision: string;
  total: number;
  moneda: "USD" | "PEN";
  estado_sunat: string;
  codigo: string | null;
  mensaje: string | null;
}

/**
 * Los días que SUNAT da para enviar una factura o una nota: hasta tres días
 * calendario después de emitirla. Pasado eso, el envío es extemporáneo.
 */
export const DIAS_PARA_ENVIAR = 3;

/** Días entre dos fechas AAAA-MM-DD (b − a), sin horas ni zonas. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

export type Plazo = { tono: "ok" | "aviso" | "urgente"; texto: string };

/** Cuánto le queda a un documento para llegar a SUNAT a tiempo. */
export function plazoDeEnvio(fechaEmision: string, hoy: string): Plazo {
  const pasados = diasEntre(fechaEmision, hoy);
  const quedan = DIAS_PARA_ENVIAR - pasados;
  if (quedan < 0) return { tono: "urgente", texto: `Fuera de plazo: lleva ${pasados} días sin enviar` };
  if (quedan === 0) return { tono: "urgente", texto: "Hoy es el último día para enviarla" };
  if (pasados === 0) return { tono: "ok", texto: "Emitida hoy" };
  return { tono: "aviso", texto: `Lleva ${pasados} ${pasados === 1 ? "día" : "días"} sin enviar; quedan ${quedan}` };
}

/**
 * El orden en que se mandan varios a la vez: primero facturas y boletas,
 * luego las notas. SUNAT rechaza la nota de un documento que todavía no
 * conoce, así que si van juntas la factura tiene que llegar antes.
 */
export function ordenDeEnvio<T extends Pick<DocumentoBandeja, "tipo" | "fecha_emision" | "numero">>(docs: readonly T[]): T[] {
  const peso = (t: TipoDocumentoSunat) => (t === "factura" || t === "boleta" ? 0 : 1);
  return [...docs].sort(
    (a, b) =>
      peso(a.tipo) - peso(b.tipo) ||
      a.fecha_emision.localeCompare(b.fecha_emision) ||
      a.numero.localeCompare(b.numero),
  );
}

/**
 * Las bajas, agrupadas por fecha de emisión: una comunicación de baja solo
 * puede llevar documentos de UNA fecha (su `ReferenceDate`).
 */
export function bajasPorFecha<T extends Pick<DocumentoBandeja, "fecha_emision">>(docs: readonly T[]): { fecha: string; documentos: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const d of docs) {
    const f = d.fecha_emision.slice(0, 10);
    grupos.set(f, [...(grupos.get(f) ?? []), d]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, documentos]) => ({ fecha, documentos }));
}

/** El siguiente correlativo de la comunicación del día (RA-AAAAMMDD-n). */
export function siguienteCorrelativoBaja(usados: readonly number[]): number {
  return usados.reduce((m, n) => Math.max(m, n), 0) + 1;
}

/** El tipo SUNAT de un documento que se da de baja (las boletas no van por aquí). */
export function tipoSunatDe(tipo: TipoDocumentoSunat): "01" | "03" | "07" | "08" {
  return tipo === "factura" ? "01" : tipo === "boleta" ? "03" : tipo === "nota_credito" ? "07" : "08";
}
