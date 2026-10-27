/**
 * Lo que el contador necesita del mes, en SOLES.
 *
 * El consultor del 23/10 lo puso entre los diez primeros: el ERP factura en
 * dólares y el Registro de Ventas se lleva en soles, así que cada mes alguien
 * tenía que sacar las facturas, buscar el cambio de SUNAT de cada día y
 * convertirlas a mano. Esto no es el PLE —el formato 14.1 lo arma el
 * programa del contador, y la recomendación fue expresamente no meterse ahí—:
 * es la hoja de la que él lo arma, con las columnas que pide el registro.
 *
 * Puro: sin base ni reloj. Entran los comprobantes del mes tal como los
 * guarda la base y salen las filas del registro.
 */

/** Los códigos de la tabla 10 de SUNAT, que es como los pide el registro. */
export const TIPO_SUNAT = { factura: "01", boleta: "03", nota_credito: "07", nota_debito: "08" } as const;

/** Tabla 2 de SUNAT: tipo de documento de identidad. */
export function tipoDocumentoSunat(tipo: string | null | undefined): string {
  switch ((tipo ?? "").toUpperCase()) {
    case "RUC":
      return "6";
    case "DNI":
      return "1";
    case "CE":
      return "4";
    case "PASAPORTE":
      return "7";
    default:
      return "0";
  }
}

export interface ComprobanteContable {
  tipo: keyof typeof TIPO_SUNAT;
  numero: string; // F002-00000559
  fecha: string; // aaaa-mm-dd
  vence: string | null;
  estado: string;
  moneda: "USD" | "PEN";
  /** En soles: el de la cotización. En dólares: el venta de SUNAT del día (148). */
  tipoCambio: number | null;
  /** Importes en DÓLARES, como los guarda la base siempre. */
  gravada: number;
  igv: number;
  total: number;
  retencion: number;
  /** En soles, los impresos (116). Solo en documentos en soles. */
  penGravada: number | null;
  penIgv: number | null;
  penTotal: number | null;
  penRetencion: number | null;
  cliente: string;
  clienteTipoDoc: string | null;
  clienteDoc: string | null;
  /** La nota apunta a su comprobante. */
  referencia: { tipo: keyof typeof TIPO_SUNAT; numero: string; fecha: string } | null;
}

export interface FilaRegistro {
  fecha: string;
  vence: string | null;
  tipo: string; // "01"
  serie: string;
  numero: string;
  clienteTipoDoc: string;
  clienteDoc: string;
  cliente: string;
  /** En soles, con signo: una nota de crédito resta. */
  base: number | null;
  igv: number | null;
  total: number | null;
  retencion: number | null;
  moneda: "USD" | "PEN";
  tipoCambio: number | null;
  /** En la moneda del documento, para cuadrar contra el papel. */
  totalOriginal: number;
  refTipo: string;
  refSerie: string;
  refNumero: string;
  refFecha: string | null;
  anulado: boolean;
  /** Por qué no se pudo pasar a soles, si no se pudo. */
  falta: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function partir(numero: string): { serie: string; correlativo: string } {
  const i = numero.indexOf("-");
  return i === -1
    ? { serie: "", correlativo: numero }
    : { serie: numero.slice(0, i), correlativo: numero.slice(i + 1) };
}

/**
 * Una fila del registro por comprobante.
 *
 * - **En soles**: los importes impresos, sin convertir nada.
 * - **En dólares**: cada importe por el cambio, redondeado a céntimos; el
 *   total es base + IGV en soles, para que la fila cuadre sola (convertir el
 *   total aparte puede dar un céntimo de diferencia).
 * - **Nota de crédito**: en negativo, que es como resta en el registro.
 * - **Anulado**: la fila se queda —el número existe y el registro no puede
 *   tener huecos— con los importes en cero.
 * - **Sin cambio**: en blanco y dicho, en vez de inventarlo o dejarlo en
 *   dólares disfrazado de soles.
 */
export function filaRegistro(c: ComprobanteContable): FilaRegistro {
  const { serie, correlativo } = partir(c.numero);
  const ref = c.referencia ? partir(c.referencia.numero) : null;
  const signo = c.tipo === "nota_credito" ? -1 : 1;
  const anulado = c.estado === "anulado";

  let base: number | null = null;
  let igv: number | null = null;
  let retencion: number | null = null;
  let falta: string | null = null;

  if (anulado) {
    base = 0;
    igv = 0;
    retencion = 0;
  } else if (c.moneda === "PEN" && c.penTotal != null) {
    base = r2(c.penGravada ?? 0);
    igv = r2(c.penIgv ?? 0);
    retencion = r2(c.penRetencion ?? 0);
  } else if (c.tipoCambio && c.tipoCambio > 0) {
    base = r2(c.gravada * c.tipoCambio);
    igv = r2(c.igv * c.tipoCambio);
    retencion = r2(c.retencion * c.tipoCambio);
  } else {
    falta = "Sin tipo de cambio";
  }

  const conSigno = (n: number | null) => (n == null ? null : r2(n * signo) || 0);

  return {
    fecha: c.fecha,
    vence: c.vence,
    tipo: TIPO_SUNAT[c.tipo],
    serie,
    numero: correlativo,
    clienteTipoDoc: tipoDocumentoSunat(c.clienteTipoDoc),
    clienteDoc: c.clienteDoc ?? "",
    cliente: c.cliente,
    base: conSigno(base),
    igv: conSigno(igv),
    total: base == null || igv == null ? null : conSigno(base + igv),
    retencion: conSigno(retencion),
    moneda: c.moneda,
    tipoCambio: c.moneda === "USD" || (c.tipoCambio ?? 0) > 0 ? c.tipoCambio : null,
    totalOriginal: anulado ? 0 : r2(signo * (c.moneda === "PEN" && c.penTotal != null ? c.penTotal : c.total)),
    refTipo: c.referencia ? TIPO_SUNAT[c.referencia.tipo] : "",
    refSerie: ref?.serie ?? "",
    refNumero: ref?.correlativo ?? "",
    refFecha: c.referencia?.fecha ?? null,
    anulado,
    falta,
  };
}

export interface TotalesRegistro {
  base: number;
  igv: number;
  total: number;
  retencion: number;
  documentos: number;
  anulados: number;
  sinCambio: number;
}

/** Los totales del mes, sumando solo lo que se pudo pasar a soles. */
export function totalesRegistro(filas: FilaRegistro[]): TotalesRegistro {
  const t: TotalesRegistro = { base: 0, igv: 0, total: 0, retencion: 0, documentos: filas.length, anulados: 0, sinCambio: 0 };
  for (const f of filas) {
    if (f.anulado) t.anulados += 1;
    if (f.falta) t.sinCambio += 1;
    t.base += f.base ?? 0;
    t.igv += f.igv ?? 0;
    t.total += f.total ?? 0;
    t.retencion += f.retencion ?? 0;
  }
  return { ...t, base: r2(t.base), igv: r2(t.igv), total: r2(t.total), retencion: r2(t.retencion) };
}

/** `2026-10` → el primer y el último día de ese mes; null si no es un mes. */
export function rangoDeMes(mes: string | null | undefined): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes ?? "");
  if (!m) return null;
  const anio = Number(m[1]);
  const mm = Number(m[2]);
  const ultimo = new Date(Date.UTC(anio, mm, 0)).getUTCDate();
  return { desde: `${m[1]}-${m[2]}-01`, hasta: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}` };
}

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `2026-10` → «octubre 2026». */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${NOMBRE_MES[Number(m) - 1] ?? m} ${a}`;
}

export interface CompraContable {
  fecha: string;
  numero: string; // CMP-26-00014, el nuestro
  documento: string | null; // F001-123, el del proveedor
  tipo: string; // local | importacion
  moneda: "USD" | "PEN";
  /** En soles, el tecleado en la compra; en dólares, el de SUNAT del día. */
  tipoCambio: number | null;
  /** En la moneda de la compra. */
  base: number;
  igv: number;
  total: number;
  proveedor: string;
  proveedorTipoDoc: string | null;
  proveedorDoc: string | null;
}

export interface FilaCompra {
  fecha: string;
  numero: string;
  serie: string;
  correlativo: string;
  tipo: string;
  proveedorTipoDoc: string;
  proveedorDoc: string;
  proveedor: string;
  base: number | null;
  igv: number | null;
  total: number | null;
  moneda: "USD" | "PEN";
  tipoCambio: number | null;
  totalOriginal: number;
  falta: string | null;
}

/**
 * Una fila del registro de compras. Las compras se guardan en SU moneda
 * (no en dólares como las ventas): en soles van tal cual, en dólares se
 * multiplican por el cambio del día. Sin número de factura del proveedor
 * también sale, y lo dice: el contador no puede registrarla sin él.
 */
export function filaCompra(c: CompraContable): FilaCompra {
  const { serie, correlativo } = partir(c.documento ?? "");
  let base: number | null = null;
  let igv: number | null = null;
  let falta: string | null = null;
  if (c.moneda === "PEN") {
    base = r2(c.base);
    igv = r2(c.igv);
  } else if (c.tipoCambio && c.tipoCambio > 0) {
    base = r2(c.base * c.tipoCambio);
    igv = r2(c.igv * c.tipoCambio);
  } else {
    falta = "Sin tipo de cambio";
  }
  if (!c.documento) falta = falta ? `${falta}; sin factura del proveedor` : "Sin factura del proveedor";
  return {
    fecha: c.fecha,
    numero: c.numero,
    serie,
    correlativo,
    tipo: c.tipo === "importacion" ? "Importación" : "Local",
    proveedorTipoDoc: tipoDocumentoSunat(c.proveedorTipoDoc),
    proveedorDoc: c.proveedorDoc ?? "",
    proveedor: c.proveedor,
    base,
    igv,
    total: base == null || igv == null ? null : r2(base + igv),
    moneda: c.moneda,
    tipoCambio: c.moneda === "USD" ? c.tipoCambio : null,
    totalOriginal: r2(c.total),
    falta,
  };
}

/**
 * Lo que NO va al registro de ventas: los documentos de las series de prueba
 * (`series_documento.es_prueba`, 093). F001-00000001 —una prueba del 14/10—
 * salía en el registro de octubre como una venta de verdad. Se devuelve
 * cuántos se quitaron para decirlo en «Léeme»: quitar sin avisar es lo mismo
 * que esconder.
 */
export function sinSeriesDePrueba<T extends { serie: string }>(
  documentos: readonly T[],
  seriesDePrueba: ReadonlySet<string>,
): { quedan: T[]; omitidos: number } {
  const quedan = documentos.filter((d) => !seriesDePrueba.has(d.serie));
  return { quedan, omitidos: documentos.length - quedan.length };
}

/** Una orden de compra sin la factura del proveedor, para pedírsela. */
export interface OrdenSinFactura {
  fecha: string;
  numero: string;
  proveedor: string;
  moneda: "USD" | "PEN";
  /** En la moneda de la orden. */
  total: number;
}

/**
 * Las compras con factura del proveedor van al registro; las demás, aparte.
 *
 * Una orden sin el documento del proveedor todavía no es una compra para el
 * contador: registrarla sería crédito fiscal sin sustento. Pero tampoco se
 * calla: va en su propia hoja, para que Willy sepa qué factura le falta pedir.
 */
export function separarCompras(compras: readonly CompraContable[]): {
  registro: CompraContable[];
  sinFactura: OrdenSinFactura[];
} {
  const registro: CompraContable[] = [];
  const sinFactura: OrdenSinFactura[] = [];
  for (const c of compras) {
    if (c.documento?.trim()) {
      registro.push(c);
    } else {
      sinFactura.push({
        fecha: c.fecha,
        numero: c.numero,
        proveedor: c.proveedor,
        moneda: c.moneda,
        total: r2(c.total),
      });
    }
  }
  return { registro, sinFactura };
}
