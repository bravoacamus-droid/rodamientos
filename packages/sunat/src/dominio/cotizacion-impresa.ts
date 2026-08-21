/**
 * La cotización, lista para imprimir.
 *
 * Es la hermana de `armarComprobanteImpreso`: recibe los datos crudos y devuelve
 * todo resuelto —fechas, símbolo, días de validez, monto en letras, desglose del
 * IGV— para que el componente visual solo maquete.
 *
 * Vive en `dominio` y no en `impresion` porque una cotización no lleva QR ni
 * hash: no necesita la librería de QR, y desde aquí se puede importar en un
 * componente de navegador sin arrastrar la firma XML ni el cliente SOAP.
 *
 * Existe por un motivo concreto: el mismo papel se arma en dos sitios —el panel
 * lo lee de sus tablas, la tienda lo recibe por token— y estaba escrito dos
 * veces. Cada copia tenía su propio criterio para las fechas y para deducir el
 * tipo de documento del cliente, así que la hoja que veía el vendedor y la que
 * abría el cliente no decían lo mismo.
 */
import { montoEnLetras } from "../ubl/numero-a-letras";
import { totalesGuardados } from "./totales";

/** Todo lo que necesita el papel de una cotización, ya resuelto. */
export interface CotizacionImpresa {
  emisor: {
    razonSocial: string;
    ruc: string;
    direccion?: string | null;
    ubicacion?: string | null;
    telefono?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  numero: string;
  fechaEmision: string;
  validaHasta?: string | null;
  /** Días entre emisión y vencimiento: «válida 15 días» se lee sin calendario. */
  diasValidez?: number | null;
  cliente: { nombre: string; doc?: string | null; tipoDoc?: string | null };
  condicionPago: string;
  moneda: string;
  simbolo: string;
  tipoCambio?: number | null;
  lineas: { descripcion: string; cantidad: number; unitario: number; importe: number }[];
  subtotal: number;
  descuento: number;
  opGravada: number;
  igv: number;
  tasaIgv: number;
  total: number;
  enLetras: string;
  notas?: string | null;
  vendedor?: string | null;
  /** Enlace público, para que pueda volver a verla desde el móvil. */
  enlace?: string | null;
}

/** Los datos tal como los tiene quien la carga, sin adaptar. */
export interface DatosCotizacion {
  emisor: {
    razonSocial: string;
    ruc: string;
    direccion?: string | null;
    /** Distrito, provincia y departamento; se unen aquí para no hacerlo dos veces. */
    distrito?: string | null;
    provincia?: string | null;
    departamento?: string | null;
    /** Si ya viene armada, se usa tal cual (la RPC pública la manda junta). */
    ubicacion?: string | null;
    telefono?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  numero: string;
  /** AAAA-MM-DD. Una columna `date` es un día, no un instante. */
  emision: string;
  validaHasta?: string | null;
  cliente: { nombre: string; doc?: string | null };
  condicionPago?: string | null;
  moneda?: string | null;
  tipoCambio?: number | null;
  /** El total YA con el descuento restado (migración 0119). */
  total: number;
  descuento?: number | null;
  tasaIgv?: number | null;
  lineas: { descripcion: string; cantidad: number; unitario: number; importe: number }[];
  notas?: string | null;
  vendedor?: string | null;
  enlace?: string | null;
}

/**
 * Tipo de documento deducido del largo del número.
 *
 * La cotización guarda el número pero no el tipo: se pide un dato al vuelo en el
 * mostrador, no una ficha completa. Once dígitos es un RUC y ocho un DNI; ante
 * cualquier otra cosa se rotula «Doc.» en vez de arriesgar una etiqueta falsa en
 * un papel que después se usa para facturar.
 */
function tipoDocumento(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const limpio = doc.replace(/\D/g, "");
  if (limpio.length === 11) return "RUC";
  if (limpio.length === 8) return "DNI";
  return "Doc.";
}

/** Días entre dos días sueltos, contados al mediodía de Lima para que ni el */
/** horario de verano ni el UTC muevan el resultado en uno. */
function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T12:00:00-05:00`);
  const b = Date.parse(`${hasta}T12:00:00-05:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const dias = Math.round((b - a) / 86_400_000);
  return dias > 0 ? dias : null;
}

export function armarCotizacionImpresa(d: DatosCotizacion): CotizacionImpresa {
  const moneda = d.moneda === "USD" ? "USD" : "PEN";
  const t = totalesGuardados(
    Number(d.total),
    Number(d.descuento ?? 0),
    Number(d.tasaIgv ?? 18),
  );

  return {
    emisor: {
      razonSocial: d.emisor.razonSocial,
      ruc: d.emisor.ruc,
      direccion: d.emisor.direccion ?? null,
      // `join` devuelve "" con la lista vacía, no null: hace falta `||` para que
      // un emisor sin distrito no deje una línea en blanco en la cabecera.
      ubicacion:
        d.emisor.ubicacion ||
        [d.emisor.distrito, d.emisor.provincia, d.emisor.departamento]
          .filter(Boolean)
          .join(" - ") ||
        null,
      telefono: d.emisor.telefono ?? null,
      email: d.emisor.email ?? null,
      logoUrl: d.emisor.logoUrl ?? null,
    },
    numero: d.numero,
    // Las fechas van tal cual, en AAAA-MM-DD: es el formato de las referencias
    // del comprobante, y la cotización no puede fechar distinto que la factura
    // que sale de ella.
    fechaEmision: d.emision,
    validaHasta: d.validaHasta ?? null,
    diasValidez:
      d.validaHasta && d.emision ? diasEntre(d.emision, d.validaHasta) : null,
    cliente: {
      nombre: d.cliente.nombre,
      doc: d.cliente.doc ?? null,
      tipoDoc: tipoDocumento(d.cliente.doc),
    },
    condicionPago: d.condicionPago === "credito" ? "Crédito" : "Contado",
    moneda,
    simbolo: moneda === "USD" ? "US$" : "S/",
    tipoCambio: d.tipoCambio ? Number(d.tipoCambio) : null,
    lineas: d.lineas,
    subtotal: t.subtotal,
    descuento: t.descuento,
    opGravada: t.gravado,
    igv: t.igv,
    tasaIgv: t.tasa,
    total: t.total,
    enLetras: montoEnLetras(t.total, moneda === "USD" ? "DÓLARES AMERICANOS" : "SOLES"),
    notas: d.notas ?? null,
    vendedor: d.vendedor ?? null,
    enlace: d.enlace ?? null,
  };
}
