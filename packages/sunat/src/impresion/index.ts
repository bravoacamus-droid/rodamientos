/**
 * Representación impresa: lo que se le entrega al comprador.
 *
 * Punto de entrada aparte (`@rodatech/sunat/impresion`) para que quien solo quiera
 * imprimir o mostrar un comprobante no arrastre el firmador ni el cliente SOAP.
 * La tienda pública lo usa así: no necesita node-forge ni xml-crypto.
 */
export * from "./qr";
export * from "./armar";
export { montoEnLetras } from "../ubl/numero-a-letras";

/** Una línea del detalle, ya calculada por quien carga los datos. */
export interface LineaImpresa {
  descripcion: string;
  cantidad: number;
  unidad: string;
  /**
   * Código interno del artículo (la columna "COD." del papel). Vacío en las
   * líneas sin producto: venta libre del POS o cobro de una reparación.
   */
  codigo: string;
  /** Unitario e importe: con IGV si montosConIgv, sin IGV si no. */
  unitario: number;
  importe: number;
  /**
   * Descuento de la línea, la columna "DTO." del A4 de Oscar. Hoy siempre 0:
   * `order_items` no guarda descuento por línea, el que existe se negocia sobre
   * el total. La columna se imprime igual, con 0, porque está en el formato y
   * porque un comprador que la busca y no la encuentra pregunta.
   */
  descuento: number;
}

/**
 * Un cobro del pedido: con qué se pagó y cuánto.
 *
 * Es una lista y no un método único porque desde la 0117 el POS admite pago
 * mixto: 100 en efectivo y 80 por Yape es una venta normal. Imprimir un solo
 * método con el total al lado —lo que hacíamos— convertía esa venta en un
 * "Efectivo — S/ 180" que nunca ocurrió.
 */
export interface PagoImpreso {
  /** "Efectivo", "Yape"… ya traducido. */
  metodo: string;
  monto: number;
}

/** Una cuenta donde el comprador puede depositar. */
export interface CuentaBancaria {
  banco: string;
  /** "Soles" / "Dólares", ya traducido. */
  moneda: string;
  numero: string;
  cci: string | null;
}

/**
 * Todo lo que necesita el papel, ya resuelto. Lo arma cada app desde su fuente
 * (el panel lee la BD; la tienda lo recibe por token), y el componente visual
 * solo maqueta: así el documento es idéntico en los dos sitios.
 */
export interface ComprobanteImpreso {
  titulo: string;
  numero: string;
  /**
   * true = el detalle va con IGV incluido (boletas y sus notas); false = sin
   * IGV (facturas y sus notas). Una nota debe leerse igual que el documento
   * que modifica, no según su propio tipo.
   */
  montosConIgv: boolean;
  /** Emitido contra el ambiente de pruebas: sin validez legal. */
  esPrueba: boolean;
  fechaEmision: string;
  /** Hora de emisión (HH:MM:SS). Va en el ticket, como en la referencia. */
  horaEmision: string;
  /** Vencimiento. Vacío al contado: sería repetir la fecha de emisión. */
  fechaVencimiento: string;
  moneda: string;
  simbolo: string;
  emisor: {
    ruc: string;
    razonSocial: string;
    direccion: string;
    ubicacion: string;
    /** Datos de contacto de la tienda. Vacíos si no están configurados. */
    telefono: string;
    email: string;
    logoUrl: string;
  };
  receptor: {
    nombre: string;
    /** Vacío cuando el comprador no se identificó. */
    tipoDoc: string;
    numDoc: string;
    /** Dirección del comprador, congelada al emitir. */
    direccion: string;
  };
  /** Quién vendió. Vacío si el pedido no lo registró. */
  vendedor: string;
  /** "Contado" / "Crédito", ya traducido. */
  condicionPago: string;
  /**
   * "Efectivo", "Yape"… ya traducido. Vacío si no se registró.
   * Es el método principal del pedido; el detalle real va en `pagos`.
   */
  formaPago: string;
  /** Cada cobro con su monto. Vacía en una venta a crédito sin cobrar aún. */
  pagos: PagoImpreso[];
  /** Dónde depositar. Vacío si el negocio no cargó cuentas. */
  cuentas: CuentaBancaria[];
  lineas: LineaImpresa[];
  opGravada: number;
  /** Operaciones exoneradas e inafectas: solo se imprimen si existen. */
  opExonerada: number;
  opInafecta: number;
  igv: number;
  total: number;
  enLetras: string;
  hash: string | null;
  /**
   * Dónde consultar este comprobante, impreso al pie: el enlace público de la
   * tienda. La referencia de Oscar cierra el papel con «Para consultar el
   * comprobante ingresar a …» y ahí va una dirección donde hay que buscar el
   * documento a mano; aquí va el enlace directo a ESTE, que es un tecleo menos
   * y no puede llevar al comprobante de otro.
   */
  enlace: string;
  /** SVG del código QR, ya generado en el servidor. */
  qrSvg: string;
  /** Solo en notas: documento que modifica y motivo. */
  referencia?: { numero: string; tipo: string; motivo: string };
  estado: string;
}
