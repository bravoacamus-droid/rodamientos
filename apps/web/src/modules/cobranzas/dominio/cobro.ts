import { redondear2 } from "@rodatech/config";
import { montoRetencion } from "@/modules/facturacion/dominio/retencion";

import {
  MEDIOS_SIN_CAJA,
  type CuotaComprobante,
  type DocumentoPorCobrar,
  type EstadoRetencion,
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
      mensaje: `Son $\u00a0${monto.toFixed(2)} sobre un saldo de $\u00a0${documento.saldo.toFixed(2)}. Si el cliente pagó de más, regístralo en el documento que corresponda.`,
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
      mensaje: `Este importe coincide con la detracción del documento ($\u00a0${documento.detraccion_monto.toFixed(2)}). ¿No será eso?`,
    });
  }

  if (
    Number.isFinite(monto) &&
    monto > 0 &&
    monto < redondear2(documento.saldo - 0.01)
  ) {
    lista.push({
      clave: "parcial",
      mensaje: `Pago parcial: quedarían $\u00a0${redondear2(documento.saldo - monto).toFixed(2)} por cobrar.`,
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

// ---------------------------------------------------------------------------
// La retención al cobrar (31/10)
//
// Willy, 31/10, cobrando la F002-502 de EXANDAL: *«el monto que sale 656.91
// es el total pero ellos son agentes de retención por lo que depositaron el
// 97 % osea $637.19, como lo registro??»*. Son DOS cobros —lo que llega al
// banco y lo que el cliente se queda para SUNAT— y la ventana solo dejaba
// uno: elegir «Retención» se llevaba el total entero como retenido.

type ConRetencion = Pick<
  DocumentoPorCobrar,
  "total" | "saldo" | "retencion_aplica" | "retencion_monto" | "retencion_cobrada"
>;

/**
 * Lo que falta registrar como retención: el 3 % del TOTAL —no del saldo: se
 * retiene sobre la factura entera, aunque se pague en cuotas— menos lo que ya
 * se registró. Si la factura nació con retención, manda su monto.
 */
export function retencionPendiente(d: ConRetencion): number {
  const total = d.retencion_aplica && d.retencion_monto > 0 ? d.retencion_monto : montoRetencion(d.total);
  return redondear2(Math.max(0, Math.min(d.saldo, total - d.retencion_cobrada)));
}

/**
 * ¿La casilla «El cliente retuvo el 3 %» viene marcada?
 *
 * Si la factura nació con retención, sí. Si no, cuando el cliente es agente y
 * la factura llega a S/ 700 (`llega_umbral`, al cambio del día en que se
 * emitió, que calcula `v_retenciones`); sin cambio (`null`) no se adivina. Y
 * nunca dos veces: si la retención ya se registró, el resto se cobra sin ella.
 */
export function retieneDePorDefecto(
  d: ConRetencion & Pick<DocumentoPorCobrar, "cliente_agente" | "llega_umbral">,
): boolean {
  if (retencionPendiente(d) <= 0) return false;
  if (d.retencion_aplica) return true;
  return d.cliente_agente && d.llega_umbral === true;
}

/**
 * Cuando el cobro contradice a la factura (31/10). Si la factura se emitió
 * desde el ERP, la retención se ELIGIÓ al facturar —el interruptor «con / sin
 * retención»— y eso es lo que tiene SUNAT. Marcar lo contrario al cobrar no
 * se impide (el cliente manda), pero se avisa. En las del Excel no se sabe
 * qué se eligió, y no se dice nada.
 */
export function avisoRetencionDistinta(
  d: Pick<DocumentoPorCobrar, "retencion_decidida" | "retencion_aplica">,
  retiene: boolean,
): string | null {
  if (!d.retencion_decidida || retiene === d.retencion_aplica) return null;
  return retiene
    ? "Esta factura se emitió SIN retención, y aquí se está registrando una. Si el cliente de verdad retuvo, la factura que tiene SUNAT no lo dice: revísalo antes de registrar."
    : "Esta factura se emitió CON retención: el cliente debería depositar solo el 97 %. Si pagó el 100 %, está bien así; si no, marca «El cliente retuvo el 3 %».";
}

/**
 * Las frases de cada estado (175). Las de Willy, 31/10: «SE REGISTRO CR / VER
 * CR EN SUNAT / NO ES AG». *«algunos agentes retenedores envían los
 * comprobantes de retención al correo, pero otros no y hay que buscarlo en
 * sunat»*: cobrada la retención y sin CR, lo que toca es buscarlo.
 */
export const ETIQUETA_RETENCION: Record<EstadoRetencion, string> = {
  cr_recibido: "Se registró el CR",
  falta_cr: "Cobrada · falta el CR",
  por_cobrar: "Retiene el 3 % al pagar",
  sin_retencion: "Sin retención",
  no_agente: "No es agente",
};

export function tonoRetencion(e: EstadoRetencion): "neutral" | "success" | "warning" | "info" {
  if (e === "cr_recibido") return "success";
  if (e === "falta_cr") return "warning";
  if (e === "por_cobrar") return "info";
  return "neutral";
}

/**
 * Cuántos días se espera el CR antes de ir a buscarlo. Willy, 31/10: *«hacen
 * el pago pero el documento de la retención le pasan después de 3, 4 días»*.
 * Pasado eso, ya no va a llegar solo: SUNAT o pedírselo al cliente.
 */
export const DIAS_ESPERA_CR = 5;

/** Días desde que se registró la retención. Sin fecha, 0. */
export function diasSinCr(retenidaEl: string | null, hoy: string): number {
  if (!retenidaEl) return 0;
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${retenidaEl}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Lo que se dice al lado de un CR que falta, según lo que lleva esperando. */
export function consejoCr(dias: number): { texto: string; urgente: boolean } {
  if (dias < DIAS_ESPERA_CR) {
    return {
      texto: dias === 0 ? "Retenida hoy: suele llegar por correo en unos días." : `Retenida hace ${dias} ${dias === 1 ? "día" : "días"}: suele llegar por correo.`,
      urgente: false,
    };
  }
  return { texto: `Retenida hace ${dias} días: búscalo en SUNAT o pídeselo al cliente.`, urgente: true };
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
