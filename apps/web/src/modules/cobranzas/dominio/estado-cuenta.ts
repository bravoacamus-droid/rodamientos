/**
 * Las cuentas del estado de cuenta de un cliente.
 *
 * Willy, 06/10 (10:20): *«hay clientes que a veces juntan 6, 7 facturas […] y
 * hay que enviar el reporte de su estado de cuenta para que lo tengan
 * presente, para que hagan el pago»*. Hoy lo lleva en un Excel y todos los
 * lunes manda el correo a los atrasados.
 *
 * Puro: sin reloj ni red. Los días de atraso vienen ya calculados de
 * `v_cartera`, que es la misma fuente que la pantalla de cobranzas: el papel
 * que se manda al cliente no puede decir un atraso distinto del que ve quien
 * le llama.
 */

export interface DocumentoEnCuenta {
  saldo: number;
  dias_vencido: number;
  fecha_vencimiento: string | null;
  /** Desde el 03/11 el estado de cuenta lleva también lo pagado. */
  total?: number;
  pagado?: number;
}

export interface ResumenCuenta {
  /** Los que deben algo. */
  documentos: number;
  /** Los ya pagados del todo (03/11). */
  pagadas: number;
  /** Lo facturado y lo pagado de todo lo que sale en el papel (03/11). */
  facturado: number;
  pagado: number;
  total: number;
  vencido: number;
  porVencer: number;
  documentosVencidos: number;
  /** El atraso del documento más atrasado; 0 si nada está vencido. */
  mayorAtraso: number;
}

export function resumirCuenta(docs: readonly DocumentoEnCuenta[]): ResumenCuenta {
  let total = 0;
  let vencido = 0;
  let documentosVencidos = 0;
  let mayorAtraso = 0;
  let documentos = 0;
  let pagadas = 0;
  let facturado = 0;
  let pagado = 0;
  for (const d of docs) {
    facturado += d.total ?? 0;
    pagado += d.pagado ?? 0;
    if (!(d.saldo > 0)) {
      pagadas += 1;
      continue;
    }
    documentos += 1;
    total += d.saldo;
    // Sin fecha de vencimiento no puede estar vencido: es contado sin cobrar,
    // y se cuenta como pendiente, no como atraso.
    if (d.fecha_vencimiento && d.dias_vencido > 0) {
      vencido += d.saldo;
      documentosVencidos += 1;
      mayorAtraso = Math.max(mayorAtraso, d.dias_vencido);
    }
  }
  return {
    documentos,
    pagadas,
    facturado: redondear(facturado),
    pagado: redondear(pagado),
    total: redondear(total),
    vencido: redondear(vencido),
    porVencer: redondear(total - vencido),
    documentosVencidos,
    mayorAtraso,
  };
}

/** Cómo se dice el plazo de un documento en el papel que recibe el cliente. */
export function plazoEnPapel(dias: number, vencimiento: string | null): string {
  if (!vencimiento) return "Al contado";
  if (dias > 1) return `${dias} días de atraso`;
  if (dias === 1) return "1 día de atraso";
  if (dias === 0) return "Vence hoy";
  return dias === -1 ? "Vence mañana" : `Vence en ${-dias} días`;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Qué parte de la historia sale en el papel (03/11). Luis, por Willy: el
 * estado de cuenta tiene que traer «todos, los que pagaron y los que falta
 * pagar». Lo pendiente sale SIEMPRE, sea de cuando sea; lo pagado, del
 * periodo elegido. Doce meses por defecto: un cliente de hace dos años lleva
 * cientos de facturas, y el papel que se manda tiene que poder leerse.
 */
export const PERIODOS_CUENTA = {
  pendiente: "Solo lo pendiente",
  "3m": "Pendiente y pagadas de los últimos 3 meses",
  "12m": "Pendiente y pagadas de los últimos 12 meses",
  todo: "Todo: pendiente y todas las pagadas",
} as const;

export type PeriodoCuenta = keyof typeof PERIODOS_CUENTA;

export const PERIODO_CUENTA_POR_DEFECTO: PeriodoCuenta = "12m";

export function leerPeriodoCuenta(v: string | undefined): PeriodoCuenta {
  return v && v in PERIODOS_CUENTA ? (v as PeriodoCuenta) : PERIODO_CUENTA_POR_DEFECTO;
}

/**
 * Desde qué fecha de emisión entran las pagadas. `null` es «todas»; con
 * «solo lo pendiente», ninguna (se devuelve mañana, que no tiene facturas).
 */
export function desdeDePeriodo(p: PeriodoCuenta, hoy: string): string | null {
  if (p === "todo") return null;
  const d = new Date(`${hoy}T12:00:00Z`);
  if (p === "pendiente") d.setUTCDate(d.getUTCDate() + 1);
  else d.setUTCMonth(d.getUTCMonth() - (p === "3m" ? 3 : 12));
  return d.toISOString().slice(0, 10);
}
