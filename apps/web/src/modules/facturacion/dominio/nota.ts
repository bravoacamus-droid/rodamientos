import { importeConDescuento, redondear2 } from "@rodatech/config";

import type { ComprobanteDetalle, TipoComprobante } from "./tipos";

/**
 * Reglas de las notas de crédito y débito.
 *
 * Una factura emitida NO se edita: se corrige con una nota, que es otro
 * documento con su propio correlativo. Ese es el diseño que impone SUNAT y el
 * que evita que un número ya declarado cambie de contenido.
 *
 * Todo lo de aquí es puro y probable sin base de datos. Y cada regla se
 * corresponde con un rechazo real: descubrirlas después cuesta un correlativo,
 * que no se recupera.
 */

/** Los motivos del catálogo 09 (nota de crédito). */
export const MOTIVOS_CREDITO = {
  ANULACION: "01",
  ANULACION_RUC: "02",
  CORRECCION_DESCRIPCION: "03",
  DESCUENTO_GLOBAL: "04",
  DESCUENTO_ITEM: "05",
  DEVOLUCION_TOTAL: "06",
  DEVOLUCION_ITEM: "07",
  DISMINUCION_VALOR: "09",
  OTROS: "10",
} as const;

/** Los motivos del catálogo 10 (nota de débito). */
export const MOTIVOS_DEBITO = {
  INTERESES_MORA: "01",
  AUMENTO_VALOR: "02",
  PENALIDADES: "03",
  AJUSTE_EXPORTACION: "11",
} as const;

export type TipoNota = "nota_credito" | "nota_debito";

/**
 * Motivos que anulan la operación ENTERA.
 *
 * Con estos, la nota tiene que ser por el total del documento y arrastrar
 * todas sus líneas: no tiene sentido «anular la operación» por la mitad. El
 * resto admiten importes parciales.
 */
export const MOTIVOS_TOTALES: readonly string[] = [
  MOTIVOS_CREDITO.ANULACION,
  MOTIVOS_CREDITO.ANULACION_RUC,
  MOTIVOS_CREDITO.DEVOLUCION_TOTAL,
];

export function esMotivoTotal(codigo: string): boolean {
  return MOTIVOS_TOTALES.includes(codigo);
}

/**
 * Motivos que NO mueven dinero: solo corrigen un dato.
 *
 * Una corrección de descripción se emite por el mismo importe que el documento
 * original, no por cero — SUNAT rechaza una nota en cero (error 2800) y el
 * documento corregido tiene que sustituir al anterior por completo.
 */
export function esCorreccionSinImporte(codigo: string): boolean {
  return codigo === MOTIVOS_CREDITO.CORRECCION_DESCRIPCION;
}

/**
 * La serie que le toca a la nota, derivada del documento afectado.
 *
 * **No se elige.** SUNAT exige que la serie de la nota empiece por la misma
 * letra que el documento que corrige: una nota sobre factura va en serie F,
 * sobre boleta en serie B. Emitirla cruzada es un rechazo con el correlativo ya
 * gastado.
 *
 * `emitir_comprobante()` toma por defecto la serie predeterminada del tipo
 * —FC01 para crédito, FD01 para débito—, que solo acierta con facturas. Por eso
 * la serie se calcula aquí y se manda siempre explícita.
 */
export function serieDeNota(tipoAfectado: TipoComprobante, tipoNota: TipoNota): string {
  const inicial = tipoAfectado === "boleta" ? "B" : "F";
  const letra = tipoNota === "nota_credito" ? "C" : "D";
  return `${inicial}${letra}01`;
}

export interface BloqueoNota {
  campo: "documento" | "motivo" | "monto" | "fecha";
  mensaje: string;
}

/**
 * Por qué NO se puede emitir la nota.
 *
 * `yaAcreditado` es la suma de las notas de crédito vigentes que ya pesan sobre
 * el documento. Sin ese dato se podrían emitir dos notas por el total y acabar
 * acreditando el doble de lo que se facturó.
 */
export function bloqueosNota(
  documento: ComprobanteDetalle | null,
  tipoNota: TipoNota,
  motivo: string,
  monto: number,
  fecha: string,
  yaAcreditado = 0,
): BloqueoNota[] {
  const lista: BloqueoNota[] = [];

  if (!documento) {
    lista.push({ campo: "documento", mensaje: "Elige el documento que se corrige." });
    return lista;
  }

  if (documento.tipo !== "factura" && documento.tipo !== "boleta") {
    lista.push({
      campo: "documento",
      mensaje: "Una nota corrige una factura o una boleta, no otra nota.",
    });
  }

  if (documento.estado === "anulado") {
    lista.push({
      campo: "documento",
      mensaje: `${documento.numero} ya está anulado: no hay nada que corregir.`,
    });
  }

  const motivos = tipoNota === "nota_credito" ? MOTIVOS_CREDITO : MOTIVOS_DEBITO;
  if (!Object.values(motivos).includes(motivo as never)) {
    lista.push({
      campo: "motivo",
      mensaje: "Falta el motivo, y SUNAT lo exige del catálogo que le corresponde.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    lista.push({ campo: "fecha", mensaje: "La fecha de la nota no es válida." });
  } else if (fecha < documento.fecha_emision) {
    // Una nota no puede ser anterior al documento que corrige: corrige algo
    // que en esa fecha todavía no existía.
    lista.push({
      campo: "fecha",
      mensaje: `La nota no puede ser anterior a ${documento.numero}, que se emitió el ${documento.fecha_emision}.`,
    });
  }

  // SUNAT rechaza una nota en cero (error 2800).
  if (!Number.isFinite(monto) || monto <= 0) {
    lista.push({ campo: "monto", mensaje: "El importe tiene que ser mayor que cero." });
  }

  if (tipoNota === "nota_credito" && Number.isFinite(monto) && monto > 0) {
    const disponible = redondear2(documento.total - yaAcreditado);

    if (esMotivoTotal(motivo) && Math.abs(monto - disponible) > 0.01) {
      lista.push({
        campo: "monto",
        mensaje: `Con este motivo la nota va por el total pendiente de acreditar (${disponible.toFixed(2)}), no por una parte.`,
      });
    }

    if (monto > redondear2(disponible + 0.01)) {
      lista.push({
        campo: "monto",
        mensaje:
          yaAcreditado > 0
            ? `Ya se acreditaron ${yaAcreditado.toFixed(2)} de este documento: quedan ${disponible.toFixed(2)}.`
            : `El importe supera el total del documento (${documento.total.toFixed(2)}).`,
      });
    }
  }

  return lista;
}

export interface AvisoNota {
  clave: string;
  mensaje: string;
}

/** Lo que conviene mirar, pero no impide emitir. */
export function avisosNota(
  documento: ComprobanteDetalle | null,
  tipoNota: TipoNota,
  motivo: string,
  monto: number,
): AvisoNota[] {
  const lista: AvisoNota[] = [];
  if (!documento) return lista;

  if (documento.estado_sunat !== "aceptado" && documento.estado_sunat !== "observado") {
    lista.push({
      clave: "sin-aceptar",
      mensaje:
        `${documento.numero} todavía no está aceptado por SUNAT. Una nota sobre un ` +
        "documento que SUNAT no reconoce se rechaza; conviene enviarlo primero.",
    });
  }

  if (tipoNota === "nota_credito" && documento.pagado > 0) {
    lista.push({
      clave: "ya-cobrado",
      mensaje: `Este documento ya tiene ${documento.pagado.toFixed(2)} cobrados. La nota reduce la deuda, no devuelve el dinero: eso se gestiona aparte.`,
    });
  }

  if (esMotivoTotal(motivo)) {
    lista.push({
      clave: "anula-todo",
      mensaje:
        "Con este motivo la operación queda anulada por completo. Si solo hay que " +
        "corregir una parte, usa «disminución en el valor» o el descuento.",
    });
  }

  if (
    documento.detraccion_aplica &&
    tipoNota === "nota_credito" &&
    Math.abs(monto - documento.total) < 0.01
  ) {
    lista.push({
      clave: "detraccion",
      mensaje: `El documento tiene detracción (${documento.detraccion_monto.toFixed(2)}). Al anularlo hay que revisar el depósito si ya se hizo.`,
    });
  }

  return lista;
}

export interface LineaNota {
  producto_id: string | null;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valor_unitario: number;
  descuento_pct: number;
}

/**
 * Las líneas de la nota.
 *
 * Con un motivo TOTAL se copian todas las del documento tal cual: se está
 * anulando la operación entera, así que la nota tiene que espejarla.
 *
 * Con un motivo parcial se emite **una sola línea** con el concepto y el
 * importe, que es como se declara un descuento o una disminución de valor. Si
 * se copiaran las líneas originales habría que repartir la rebaja entre ellas,
 * y ese reparto no lo decide el sistema: lo decide quien negocia.
 */
export function lineasDeNota(
  documento: ComprobanteDetalle,
  motivo: string,
  monto: number,
  concepto: string,
): LineaNota[] {
  if (esMotivoTotal(motivo) || esCorreccionSinImporte(motivo)) {
    return documento.lineas.map((l) => ({
      producto_id: l.producto_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: l.cantidad,
      valor_unitario: l.valor_unitario,
      descuento_pct: l.descuento_pct,
    }));
  }

  return [
    {
      producto_id: null,
      codigo: "NOTA",
      descripcion: concepto.trim() || "Ajuste sobre " + documento.numero,
      unidad: "NIU",
      cantidad: 1,
      // El importe entra SIN IGV, como todos los valores unitarios del
      // sistema: el IGV lo calcula `emitir_comprobante()` sobre la base.
      valor_unitario: valorSinIgv(monto),
      descuento_pct: 0,
    },
  ];
}

/**
 * Convierte un importe CON IGV al valor unitario sin IGV.
 *
 * Quien emite la nota piensa en el total —«le devuelvo 118»— pero el documento
 * se construye sobre la base gravada. Se redondea a cuatro decimales, que es la
 * escala de `valor_unitario`.
 */
export function valorSinIgv(totalConIgv: number, tasaIgv = 0.18): number {
  if (!Number.isFinite(totalConIgv) || totalConIgv <= 0) return 0;
  return Math.round((totalConIgv / (1 + tasaIgv)) * 10000) / 10000;
}

/**
 * El total que va a salir de una nota de una sola línea.
 *
 * Sirve para enseñar en pantalla lo que se va a emitir ANTES de emitirlo. No
 * siempre coincide al céntimo con lo que se tecleó: el valor unitario tiene
 * cuatro decimales y el IGV se calcula sobre la base ya redondeada, así que
 * pedir «118» puede acabar en 117,99. Enseñarlo evita la sorpresa.
 */
export function totalDeNota(monto: number, tasaIgv = 0.18): number {
  const base = importeConDescuento(1, valorSinIgv(monto, tasaIgv), 0);
  return redondear2(base + redondear2(base * tasaIgv));
}
