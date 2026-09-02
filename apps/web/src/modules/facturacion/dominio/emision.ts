import { IGV, importeConDescuento, redondear2 } from "@rodatech/config";

import type { CotizacionFacturable, TipoComprobante } from "./tipos";

/**
 * Reglas de emisión, puras y probables sin base de datos.
 *
 * Lo que decide aquí acaba en un XML que SUNAT valida y puede rechazar, así
 * que cada regla lleva escrito de dónde sale. Los rechazos de SUNAT son
 * caros: el correlativo se quema igual y hay que emitir otro documento.
 */

/** Tipos de documento de identidad del catálogo 06. */
export const DOC_SUNAT = {
  SIN_DOCUMENTO: "0",
  DNI: "1",
  CARNET_EXTRANJERIA: "4",
  RUC: "6",
  PASAPORTE: "7",
} as const;

export type DocSunat = (typeof DOC_SUNAT)[keyof typeof DOC_SUNAT];

/** Traduce el tipo de documento del maestro de clientes al catálogo 06. */
export function docSunatDe(tipo: string | null): DocSunat {
  switch ((tipo ?? "").toUpperCase()) {
    case "RUC":
      return DOC_SUNAT.RUC;
    case "DNI":
      return DOC_SUNAT.DNI;
    case "CE":
      return DOC_SUNAT.CARNET_EXTRANJERIA;
    case "PASAPORTE":
      return DOC_SUNAT.PASAPORTE;
    default:
      return DOC_SUNAT.SIN_DOCUMENTO;
  }
}

/**
 * ¿Factura o boleta?
 *
 * La regla es del negocio, no de la pantalla: **factura solo con RUC**. Un
 * comprobante tipo 01 con un receptor que no es RUC lo rechaza SUNAT (error
 * 2017), y el correlativo ya se gastó.
 *
 * Willy vende casi todo a empresas, así que lo normal será factura; la boleta
 * es para el técnico que compra un rodamiento suelto.
 */
export function tipoSugerido(tipoDocumento: string | null): TipoComprobante {
  return docSunatDe(tipoDocumento) === DOC_SUNAT.RUC ? "factura" : "boleta";
}

export interface Bloqueo {
  campo: "cliente" | "documento" | "lineas" | "tipo" | "montos";
  mensaje: string;
}

/**
 * Por qué NO se puede emitir todavía.
 *
 * Devuelve motivos, no un booleano. Y son motivos concretos: cada uno
 * corresponde a un rechazo real de SUNAT que sería mucho más caro descubrir
 * después, con el correlativo quemado.
 */
export function bloqueosEmision(
  cotizacion: CotizacionFacturable,
  tipo: TipoComprobante,
): Bloqueo[] {
  const lista: Bloqueo[] = [];
  const doc = docSunatDe(cotizacion.cliente_tipo_documento);
  const numero = (cotizacion.cliente_documento ?? "").trim();

  if (tipo === "factura") {
    if (doc !== DOC_SUNAT.RUC) {
      lista.push({
        campo: "tipo",
        mensaje:
          "Una factura exige RUC. Este cliente no lo tiene: emite boleta, o completa su RUC en la ficha.",
      });
    } else if (!/^(10|15|17|20)\d{9}$/.test(numero)) {
      lista.push({
        campo: "documento",
        mensaje: `El RUC ${numero || "(vacío)"} no tiene un formato válido.`,
      });
    }
  }

  if (tipo === "boleta") {
    // La boleta admite receptor sin documento, pero solo por debajo del
    // umbral. Por encima, SUNAT exige identificar al comprador.
    if (doc === DOC_SUNAT.SIN_DOCUMENTO && cotizacion.total > 700) {
      lista.push({
        campo: "documento",
        mensaje:
          "Una boleta de más de 700 necesita el documento del comprador. Complétalo en su ficha.",
      });
    }
    if (doc === DOC_SUNAT.DNI && !/^\d{8}$/.test(numero)) {
      lista.push({
        campo: "documento",
        mensaje: `El DNI ${numero || "(vacío)"} no tiene ocho dígitos.`,
      });
    }
  }

  if (cotizacion.lineas.length === 0) {
    // Los dos casos acaban sin líneas y llevan a sitios distintos: uno se
    // arregla editando la cotización y el otro no se arregla, ya está hecho.
    lista.push({
      campo: "lineas",
      mensaje:
        cotizacion.lineas_ya_facturadas > 0
          ? "Ya se facturó todo lo que el cliente confirmó de esta cotización."
          : "La cotización no tiene líneas.",
    });
  }

  // Una línea a valor cero no es ilegal, pero un comprobante ENTERO a cero sí
  // es siempre un error de captura.
  if (cotizacion.lineas.length > 0 && cotizacion.total <= 0) {
    lista.push({
      campo: "montos",
      mensaje: "El total es cero. Revisa los precios antes de emitir.",
    });
  }

  return lista;
}

export interface TotalesComprobante {
  gravada: number;
  igv: number;
  total: number;
  /** Cuánto se descontó frente al precio de lista. */
  descuento: number;
}

/**
 * Totales del comprobante.
 *
 * Réplica de lo que hace `emitir_comprobante()` en Postgres: el importe se
 * redondea POR LÍNEA —`comprobante_items.importe` es columna generada— y luego
 * se suman las líneas ya redondeadas. Sumar con todos los decimales y
 * redondear al final daría un total distinto al que se guarda, y la resta de
 * céntimos entre la cabecera y el detalle es exactamente por lo que SUNAT
 * observa un comprobante.
 *
 * Usa `importeConDescuento`, no `redondear2(cantidad × precio)`: con valores
 * unitarios de cuatro decimales la multiplicación en coma flotante se come
 * medio céntimo.
 */
export function totalesDe(
  lineas: readonly {
    cantidad: number;
    valor_unitario: number;
    descuento_pct?: number;
  }[],
  igvPct = IGV * 100,
): TotalesComprobante {
  let gravada = 0;
  let bruto = 0;

  for (const l of lineas) {
    const dscto = l.descuento_pct ?? 0;
    bruto = redondear2(bruto + importeConDescuento(l.cantidad, l.valor_unitario, 0));
    // El descuento va como TERCER factor, no aplicado antes al precio.
    // `cantidad × (valor × factor)` redondea el precio con descuento a cuatro
    // decimales por el camino; Postgres multiplica los tres con precisión
    // completa y redondea UNA vez, al final. Con descuentos que no son redondos
    // —12,5 %, 7,5 %— las dos cuentas se separan por un céntimo.
    gravada = redondear2(
      gravada + importeConDescuento(l.cantidad, l.valor_unitario, dscto),
    );
  }

  const igv = redondear2((gravada * igvPct) / 100);

  return {
    gravada,
    igv,
    total: redondear2(gravada + igv),
    descuento: redondear2(bruto - gravada),
  };
}

/**
 * ¿Aplica detracción (SPOT)?
 *
 * Solo en facturas, y solo por encima del umbral. La boleta nunca lleva
 * detracción: es un régimen de comprobantes con RUC, y la base lo impide con
 * la restricción `comp_boleta_sin_spot`.
 */
export function aplicaDetraccion(
  tipo: TipoComprobante,
  total: number,
  umbral: number,
): boolean {
  return tipo === "factura" && total > umbral;
}

/** Monto de la detracción, redondeado como lo hace la base. */
export function montoDetraccion(total: number, porcentaje: number): number {
  return redondear2((total * porcentaje) / 100);
}

export interface Cuota {
  numero: number;
  monto: number;
  vencimiento: string;
}

/**
 * Cronograma de cuotas para una venta al crédito.
 *
 * SUNAT no admite «al crédito» a secas desde 2022: exige el detalle con
 * importe y vencimiento de cada cuota, o rechaza con el error 3251. Aquí se
 * genera una sola cuota por el total, que es como trabaja Willy —a 30, 60 o
 * 90 días, de una vez—, pero la forma admite varias sin cambiar nada.
 *
 * `desde` entra como texto `aaaa-mm-dd` a propósito: el dominio no lee reloj,
 * para que dos ejecuciones iguales den el mismo resultado.
 */
export function cuotasDe(
  total: number,
  diasCredito: number,
  desde: string,
  partes = 1,
): Cuota[] {
  if (diasCredito <= 0 || partes < 1) return [];

  const base = new Date(`${desde}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return [];

  const cuotas: Cuota[] = [];
  // Se reparte a partes iguales y el ÚLTIMO absorbe el descuadre del
  // redondeo: si no, la suma de las cuotas no da el total y SUNAT lo rechaza.
  const cuota = redondear2(total / partes);
  let acumulado = 0;

  for (let i = 1; i <= partes; i++) {
    const monto = i === partes ? redondear2(total - acumulado) : cuota;
    acumulado = redondear2(acumulado + monto);

    const vence = new Date(base);
    vence.setUTCDate(vence.getUTCDate() + Math.round((diasCredito * i) / partes));

    cuotas.push({
      numero: i,
      monto,
      vencimiento: vence.toISOString().slice(0, 10),
    });
  }

  return cuotas;
}

/** Fecha de vencimiento de la venta al crédito. */
export function vencimientoDe(desde: string, diasCredito: number): string | null {
  if (diasCredito <= 0) return null;
  const base = new Date(`${desde}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + diasCredito);
  return base.toISOString().slice(0, 10);
}

/**
 * Unidad de medida del catálogo 03.
 *
 * El maestro ya guarda códigos SUNAT, así que casi siempre pasa tal cual. El
 * respaldo a `NIU` existe para un producto antiguo con la unidad en blanco:
 * mejor emitir con «unidad» que no poder emitir.
 */
export function unidadSunat(codigo: string | null): string {
  const c = (codigo ?? "").trim().toUpperCase();
  return c.length >= 2 ? c : "NIU";
}
