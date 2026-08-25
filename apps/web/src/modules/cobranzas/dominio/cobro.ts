import { redondear2 } from "@rodatech/config";

import {
  MEDIOS_SIN_CAJA,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type MedioPago,
  type TramoAging,
} from "./tipos";

/**
 * Reglas de cobro, puras y probables sin base de datos.
 *
 * Aquí NO se calcula ningún saldo para guardarlo: eso lo hace el trigger
 * `trg_pagos_recalcular` en Postgres, que además reparte sobre las cuotas de la
 * más antigua a la más nueva. Lo de aquí es lo que la pantalla necesita para
 * avisar ANTES de mandar el pago — cobrar de más, o cobrar de un documento
 * anulado, es de lo que peor se sale después.
 */

export interface Bloqueo {
  campo: "monto" | "documento" | "fecha" | "medio";
  mensaje: string;
}

/**
 * Por qué NO se puede registrar este pago.
 *
 * El tope es el saldo, con un céntimo de tolerancia. Es la misma holgura que
 * usa `comp_pagado_rango` en la base (`pagado <= total + 0.01`), y existe
 * porque el cliente transfiere el total redondeado y a veces sobra o falta un
 * céntimo por el cambio.
 */
export function bloqueosPago(
  documento: DocumentoPorCobrar | null,
  monto: number,
  fecha: string,
): Bloqueo[] {
  const lista: Bloqueo[] = [];

  if (!documento) {
    lista.push({ campo: "documento", mensaje: "Elige el documento que se está cobrando." });
    return lista;
  }

  if (documento.estado === "anulado") {
    lista.push({
      campo: "documento",
      mensaje: `${documento.numero} está anulado: no se le pueden aplicar pagos.`,
    });
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    lista.push({ campo: "monto", mensaje: "El importe tiene que ser mayor que cero." });
  } else if (monto > redondear2(documento.saldo + 0.01)) {
    lista.push({
      campo: "monto",
      mensaje: `Son ${monto.toFixed(2)} sobre un saldo de ${documento.saldo.toFixed(2)}. Si el cliente pagó de más, regístralo en el documento que corresponda.`,
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    lista.push({ campo: "fecha", mensaje: "La fecha del pago no es válida." });
  }

  return lista;
}

export interface Aviso {
  clave: string;
  mensaje: string;
}

/** Lo que conviene mirar, pero no impide registrar. */
export function avisosPago(
  documento: DocumentoPorCobrar | null,
  monto: number,
  medio: MedioPago,
  fecha: string,
  hoy: string,
): Aviso[] {
  const lista: Aviso[] = [];
  if (!documento) return lista;

  // Un pago con fecha futura no es ilegal —una letra se registra al aceptarla—
  // pero casi siempre es un dedo en el teclado.
  if (fecha > hoy) {
    lista.push({
      clave: "futuro",
      mensaje: "La fecha del pago es posterior a hoy. Comprueba que sea la correcta.",
    });
  }

  if (MEDIOS_SIN_CAJA.includes(medio)) {
    lista.push({
      clave: "sin-caja",
      mensaje:
        "Este medio reduce el saldo pero NO entra dinero a la cuenta, así que no va a aparecer en el extracto del banco.",
    });
  }

  // La detracción la deposita el cliente, no la paga; si el importe coincide
  // casi seguro es eso y no una transferencia.
  if (
    documento.detraccion_aplica &&
    medio !== "detraccion" &&
    Math.abs(monto - documento.detraccion_monto) < 0.01
  ) {
    lista.push({
      clave: "parece-detraccion",
      mensaje: `Este importe coincide con la detracción del documento (${documento.detraccion_monto.toFixed(2)}). ¿No será eso?`,
    });
  }

  if (
    Number.isFinite(monto) &&
    monto > 0 &&
    monto < redondear2(documento.saldo - 0.01)
  ) {
    lista.push({
      clave: "parcial",
      mensaje: `Pago parcial: quedarían ${redondear2(documento.saldo - monto).toFixed(2)} por cobrar.`,
    });
  }

  return lista;
}

/**
 * ¿Este pago deja el documento saldado?
 *
 * Con la misma tolerancia de un céntimo que usa `recalcular_comprobante()` para
 * marcarlo como pagado. Sin ella, una transferencia por el total redondeado
 * dejaría el documento eternamente en «parcial» por dos céntimos.
 */
export function quedaSaldado(saldo: number, monto: number): boolean {
  return monto >= redondear2(saldo - 0.01);
}

/**
 * Cómo se reparte un pago sobre las cuotas.
 *
 * Réplica de lo que hace `recalcular_comprobante()`: de la más antigua a la más
 * nueva, llenando cada una antes de pasar a la siguiente. Se calcula aquí solo
 * para ENSEÑARLO antes de confirmar — quien cobra necesita saber qué cuota
 * queda cerrada, porque es lo que le va a decir al cliente por teléfono.
 */
export function repartoEnCuotas(
  cuotas: readonly CuotaComprobante[],
  monto: number,
): { cuota: CuotaComprobante; aplica: number; quedaSaldo: number }[] {
  let restante = redondear2(monto);

  return [...cuotas]
    .sort((a, b) => a.numero - b.numero)
    .map((cuota) => {
      const aplica = redondear2(Math.min(restante, cuota.saldo));
      restante = redondear2(restante - aplica);
      return {
        cuota,
        aplica,
        quedaSaldo: redondear2(cuota.saldo - aplica),
      };
    });
}

/**
 * Etiqueta corta del atraso, para la fila del listado.
 *
 * Se dice en días y no solo con el tramo: «vencido hace 47 días» mueve más que
 * «31-60», que es una categoría.
 */
export function etiquetaAtraso(dias: number, vencimiento: string | null): string {
  if (!vencimiento) return "sin vencimiento";
  if (dias <= 0) return "por vencer";
  if (dias === 1) return "vencido ayer";
  return `vencido hace ${dias} días`;
}

/**
 * Prioridad de cobro, de 0 a 100.
 *
 * Ordena la cartera por lo que de verdad urge, que no es solo el importe ni
 * solo la antigüedad: es la combinación. Una factura de 200 con 120 días
 * atrasados y una de 5.000 con 10 pesan distinto, y llamar en el orden
 * equivocado cuesta dinero.
 *
 * El peso del atraso satura a los 90 días: más allá el problema ya no es de
 * cobranza, es de decidir si se reclama por otra vía.
 */
export function prioridad(saldo: number, dias: number, saldoMayor: number): number {
  const porAtraso = Math.min(dias, 90) / 90;
  const porImporte = saldoMayor > 0 ? Math.min(saldo / saldoMayor, 1) : 0;
  // Pesa más el atraso: una deuda vieja se cobra peor cuanto más se espera,
  // mientras que una grande y reciente sigue estando dentro de plazo.
  return Math.round((porAtraso * 0.65 + porImporte * 0.35) * 100);
}

/** Color del tramo, del verde al rojo. Los mismos que usa el informe. */
export const COLOR_TRAMO: Record<TramoAging, string> = {
  sin_vencimiento: "var(--fg-subtle)",
  por_vencer: "var(--ok)",
  "1_30": "var(--warn)",
  "31_60": "var(--warn)",
  "61_90": "var(--danger)",
  mas_90: "var(--danger)",
};

/** Tono de la insignia por tramo. */
export function tonoTramo(
  tramo: TramoAging,
): "neutral" | "success" | "warning" | "danger" {
  switch (tramo) {
    case "por_vencer":
      return "success";
    case "1_30":
    case "31_60":
      return "warning";
    case "61_90":
    case "mas_90":
      return "danger";
    default:
      return "neutral";
  }
}
