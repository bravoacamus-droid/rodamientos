/**
 * Arma la representación impresa a partir de los datos crudos del comprobante.
 *
 * Función pura: no sabe de bases de datos ni de dónde salieron los datos. La
 * usan tanto el panel (que los lee de sus tablas) como la página pública del
 * cliente (que los recibe por token), y por eso el documento sale idéntico en
 * ambos sitios sin repetir una sola regla.
 *
 * Aquí viven las decisiones de presentación que exige SUNAT o el uso peruano:
 * el título legal, el criterio de mostrar importes con o sin IGV, la leyenda
 * del monto en letras y el QR.
 */
import { generarQrSvg } from "./qr";
import { montoEnLetras } from "../ubl/numero-a-letras";
import { redondear } from "../catalogos/validaciones";
import type { ComprobanteImpreso, LineaImpresa, PagoImpreso } from "./index";

const TITULO: Record<string, string> = {
  "01": "FACTURA ELECTRÓNICA",
  "03": "BOLETA DE VENTA ELECTRÓNICA",
  "07": "NOTA DE CRÉDITO ELECTRÓNICA",
  "08": "NOTA DE DÉBITO ELECTRÓNICA",
};

const TIPO_DOC_RECEPTOR: Record<string, string> = {
  "6": "RUC",
  "1": "DNI",
  "4": "Carnet de extranjería",
  "7": "Pasaporte",
  "0": "Sin documento",
};

const MONEDA_NOMBRE: Record<string, string> = {
  PEN: "SOLES",
  USD: "DÓLARES AMERICANOS",
};

/**
 * Cómo se cobró, en palabras. Vive aquí y no en cada app porque el mismo texto
 * sale en el comprobante del panel, en el del comprador y en la nota de venta:
 * si cada sitio tuviera su tabla, tarde o temprano dirían cosas distintas.
 */
export const FORMAS_DE_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  // `tarjeta` se sigue traduciendo aunque la pantalla ya no lo ofrezca: es lo que
  // guardaron las ventas anteriores a partirla en crédito y débito, y un
  // comprobante viejo tiene que poder reimprimirse.
  tarjeta: "Tarjeta",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
  transferencia: "Transferencia",
  credito: "Crédito",
  mixto: "Pago mixto",
  whatsapp: "Coordinado por WhatsApp",
  contra_entrega: "Contra entrega",
};

/** Nombre corto de la moneda, como se rotula una cuenta bancaria. */
const MONEDA_CUENTA: Record<string, string> = { PEN: "Soles", USD: "Dólares" };

/** Una línea tal como está guardada: importe y su porción de IGV. */
export interface LineaCruda {
  descripcion: string;
  cantidad: number;
  /** Importe de la línea CON IGV. */
  importeConIgv: number;
  /** Porción de IGV de esa línea. */
  igv: number;
  /** Unidad SUNAT de la línea (catálogo 03). Por defecto NIU. */
  unidad?: string | null;
  /** Código interno del artículo, congelado al emitir. */
  codigo?: string | null;
}

export interface DatosComprobante {
  emisor: {
    ruc: string;
    razonSocial: string;
    direccion: string;
    distrito?: string | null;
    provincia?: string | null;
    departamento?: string | null;
    /** Emitido contra el ambiente de pruebas de SUNAT. */
    esPrueba: boolean;
    /** Contacto y logo de la tienda (settings). Opcionales. */
    telefono?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  fechaEmision: Date;
  moneda: string;
  receptor: {
    nombre: string;
    tipoDoc: string;
    /** Vacío o nulo si el comprador no se identificó. */
    numDoc?: string | null;
    /** Dirección congelada al emitir. */
    direccion?: string | null;
  };
  /** Nombre de quien vendió, congelado al emitir. */
  vendedor?: string | null;
  /** Código: 'contado' | 'credito'. Por defecto contado. */
  condicionPago?: string | null;
  /** Código del método de pago del pedido (efectivo, yape…). */
  formaPago?: string | null;
  /**
   * Los cobros del pedido, tal como salen de `order_payments`.
   *
   * `undefined` significa «no lo sé» y entonces se cae al método principal por
   * el total; una lista VACÍA significa «no se ha cobrado nada», que es lo que
   * pasa en una venta a crédito recién emitida. Son cosas distintas y el papel
   * las dice distinto: si se confundieran, una factura a 30 días saldría
   * impresa como cobrada.
   */
  pagos?: { metodo: string; monto: number }[];
  /** Enlace público donde consultar el comprobante. */
  enlace?: string | null;
  /** Solo si es a crédito: cuándo vence. */
  fechaVencimiento?: string | Date | null;
  /** Cuentas donde depositar, tal como salen de la tabla. */
  cuentas?: {
    bank: string;
    currency: string;
    account_number: string;
    cci?: string | null;
  }[];
  opGravada: number;
  /** Operaciones exoneradas e inafectas (0 si el comprobante no las tiene). */
  opExonerada?: number | null;
  opInafecta?: number | null;
  igv: number;
  total: number;
  estado: string;
  hash?: string | null;
  items: LineaCruda[];
  /** Solo en notas (07/08): documento que modifica. */
  referencia?: {
    numero: string;
    tipoDocumento: string;
    motivo: string;
  } | null;
}

/**
 * Fecha del papel, en AAAA-MM-DD.
 *
 * Es el formato de las dos referencias que pasó Oscar (A4 y ticketera), y el
 * único que no se puede leer mal: 03/08 y 08/03 son el mismo papel en dos
 * países, y este documento lo miran el comprador, el contador y SUNAT.
 *
 * Se arma por partes en vez de pedirle el formato a una locale ("en-CA" da
 * AAAA-MM-DD) porque eso depende de qué ICU trae el Node del despliegue, y una
 * fecha que cambia de forma según el servidor no es una fecha.
 */
function fechaIso(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/**
 * Fecha que NO lleva hora, como el vencimiento (`date` en Postgres).
 *
 * No puede pasar por `new Date(...)` + zona horaria: "2026-09-02" se lee como
 * medianoche UTC y, convertido a Lima (UTC-5), retrocede al día 1. El papel
 * acabaría diciendo que la factura vence un día antes de lo pactado, que es
 * justo el dato con el que se reclama un cobro. Un día suelto no tiene zona
 * horaria: ya viene en AAAA-MM-DD, se usa tal cual.
 */
function fechaSuelta(v: string | Date): string {
  if (typeof v === "string") {
    const m = v.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }
  return fechaIso(new Date(v));
}

/** Hora de Lima. El papel la muestra junto a la fecha de emisión. */
function horaLima(d: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function adaptarLinea(l: LineaCruda, conIgv: boolean): LineaImpresa {
  const cantidad = l.cantidad || 1;
  const importe = conIgv ? l.importeConIgv : l.importeConIgv - l.igv;
  return {
    descripcion: l.descripcion,
    cantidad,
    unidad: l.unidad || "NIU",
    codigo: l.codigo ?? "",
    unitario: redondear(importe / cantidad),
    importe: redondear(importe),
    // Cuando exista el descuento por línea saldrá de aquí. Ver LineaImpresa.
    descuento: 0,
  };
}

/**
 * Los cobros, en palabras y con su monto.
 *
 * Se leen en vivo, como las cuentas bancarias y por el mismo motivo: no son un
 * hecho fiscal del documento sino el estado del cobro. Reimprimir una factura a
 * crédito que ya se pagó a medias debe mostrar lo cobrado HOY, no el vacío del
 * día que se emitió.
 */
function adaptarPagos(d: DatosComprobante): PagoImpreso[] {
  if (d.pagos) {
    return d.pagos
      .filter((p) => Number(p.monto) > 0)
      .map((p) => ({
        metodo: FORMAS_DE_PAGO[p.metodo] ?? p.metodo,
        monto: redondear(Number(p.monto)),
      }));
  }
  // Sin lista, lo único que se sabe es el método principal del pedido.
  if (!d.formaPago) return [];
  return [
    { metodo: FORMAS_DE_PAGO[d.formaPago] ?? d.formaPago, monto: d.total },
  ];
}

export async function armarComprobanteImpreso(
  d: DatosComprobante,
): Promise<ComprobanteImpreso> {
  // Una nota debe leerse igual que el documento que modifica: si la boleta
  // mostraba precios con IGV, su nota no puede mostrarlos sin él.
  const refEsBoleta = d.referencia?.tipoDocumento === "03";
  const montosConIgv = d.tipoDocumento === "03" || refEsBoleta;

  const moneda = d.moneda === "USD" ? "USD" : "PEN";
  const numDoc = d.receptor.numDoc ?? "";

  const qrSvg = await generarQrSvg({
    rucEmisor: d.emisor.ruc,
    tipoDocumento: d.tipoDocumento,
    serie: d.serie,
    correlativo: d.correlativo,
    igv: d.igv,
    total: d.total,
    fechaEmision: d.fechaEmision,
    receptorTipoDoc: d.receptor.tipoDoc || "0",
    receptorNumDoc: numDoc || "-",
  });

  return {
    titulo: TITULO[d.tipoDocumento] ?? "COMPROBANTE ELECTRÓNICO",
    numero: `${d.serie}-${String(d.correlativo).padStart(8, "0")}`,
    montosConIgv,
    esPrueba: d.emisor.esPrueba,
    fechaEmision: fechaIso(d.fechaEmision),
    horaEmision: horaLima(d.fechaEmision),
    // Al contado el vencimiento es el mismo día: repetirlo no dice nada y en
    // 80 mm cada línea cuenta.
    fechaVencimiento: d.fechaVencimiento ? fechaSuelta(d.fechaVencimiento) : "",
    moneda,
    simbolo: moneda === "USD" ? "US$" : "S/",
    emisor: {
      ruc: d.emisor.ruc,
      razonSocial: d.emisor.razonSocial,
      direccion: d.emisor.direccion,
      ubicacion: [d.emisor.distrito, d.emisor.provincia, d.emisor.departamento]
        .filter(Boolean)
        .join(" - "),
      telefono: d.emisor.telefono ?? "",
      email: d.emisor.email ?? "",
      logoUrl: d.emisor.logoUrl ?? "",
    },
    // Sin número de documento no se rotula "DNI: —": el comprador va sin
    // identificar, que es válido en boletas menores a S/ 700.
    receptor: {
      nombre: d.receptor.nombre,
      tipoDoc: numDoc ? (TIPO_DOC_RECEPTOR[d.receptor.tipoDoc] ?? "Documento") : "",
      numDoc,
      direccion: d.receptor.direccion ?? "",
    },
    vendedor: d.vendedor ?? "",
    condicionPago: d.condicionPago === "credito" ? "Crédito" : "Contado",
    // Un método desconocido se muestra tal cual antes que desaparecer: es
    // preferible leer "izipay" en el papel que no saber cómo se cobró.
    formaPago: d.formaPago ? (FORMAS_DE_PAGO[d.formaPago] ?? d.formaPago) : "",
    pagos: adaptarPagos(d),
    cuentas: (d.cuentas ?? []).map((b) => ({
      banco: b.bank,
      moneda: MONEDA_CUENTA[b.currency] ?? b.currency,
      numero: b.account_number,
      cci: b.cci ?? null,
    })),
    lineas: d.items.map((l) => adaptarLinea(l, montosConIgv)),
    opGravada: d.opGravada,
    opExonerada: Number(d.opExonerada ?? 0),
    opInafecta: Number(d.opInafecta ?? 0),
    igv: d.igv,
    total: d.total,
    enLetras: montoEnLetras(d.total, MONEDA_NOMBRE[moneda]),
    hash: d.hash ?? null,
    enlace: d.enlace ?? "",
    qrSvg,
    referencia: d.referencia
      ? {
          numero: d.referencia.numero,
          tipo: d.referencia.tipoDocumento === "01" ? "Factura" : "Boleta de venta",
          motivo: d.referencia.motivo,
        }
      : undefined,
    estado: d.estado,
  };
}
