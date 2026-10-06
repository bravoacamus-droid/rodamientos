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
}

export interface ResumenCuenta {
  documentos: number;
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
  for (const d of docs) {
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
    documentos: docs.length,
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
