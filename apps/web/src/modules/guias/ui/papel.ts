import type { EmisorHoja } from "@/componentes/hoja-documento";
import type { BloquePiePdf, HojaPdf } from "@/lib/pdf-hoja";

import { ETIQUETA_MODALIDAD, type GuiaDetalle } from "../dominio/tipos";

/**
 * Lo que dice la cabecera del papel de la guía, y la guía entera como PDF.
 *
 * Aparte del componente desde el 14/10 porque ahora la dibujan DOS: la hoja
 * que se imprime (`DocumentoGuia`) y el PDF que se descarga. Escrito una
 * sola vez, no pueden decir cosas distintas.
 */

const fecha = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : f;
};

export function datosDeGuia(g: GuiaDetalle) {
  return [
    { etiqueta: "Destinatario", valor: g.cliente ?? "—" },
    { etiqueta: "Fecha de emisión", valor: fecha(g.fecha_emision) },
    { etiqueta: "RUC / DNI", valor: g.cliente_documento ?? "—" },
    // Dirección y teléfono del destinatario, como su formato (15/10).
    g.cliente_direccion ? { etiqueta: "Dirección", valor: g.cliente_direccion, ancho: true } : null,
    g.cliente_telefono ? { etiqueta: "Teléfono", valor: g.cliente_telefono } : null,
    // «Inicio de traslado» y no «fecha de traslado». Willy, 40:34:
    // *«inicio de traslado, porque puede que lo prepare ahora, pero lo
    // llegue mañana»*. Es el día que sale la mercadería, no el día que se
    // escribió el papel — y son dos fechas distintas que estaban con el
    // mismo nombre.
    { etiqueta: "Inicio de traslado", valor: fecha(g.fecha_traslado) },
    {
      etiqueta: "Motivo",
      valor: g.motivo_descripcion ?? `Código ${g.motivo_codigo}`,
    },
    { etiqueta: "Modalidad", valor: ETIQUETA_MODALIDAD[g.modalidad_traslado] },
    {
      etiqueta: "Punto de partida",
      // El distrito escrito y no el código del ubigeo (15/10).
      valor: [g.direccion_partida, g.partida_lugar ?? g.ubigeo_partida].filter(Boolean).join(" - ") || "—",
      ancho: true,
    },
    {
      etiqueta: "Punto de llegada",
      valor: [g.direccion_llegada, g.llegada_lugar ?? g.ubigeo_llegada].filter(Boolean).join(" - ") || "—",
      ancho: true,
    },
    {
      etiqueta: "Peso bruto",
      valor: `${Number(g.peso_bruto_kg).toFixed(2)} ${g.unidad_peso}`,
    },
    {
      etiqueta: "Bultos",
      valor: String(g.numero_bultos),
    },
    /*
      Los tres documentos que atan esta guía a la venta, como en el
      formato de Willy: «COMPROBANTE DE PAGO · N° DE COTIZACIÓN · ORDEN DE
      COMPRA».

      El comprobante suele ir vacío cuando la guía se imprime, y es
      correcto: la guía va ANTES que la factura (33:00). *«Los productos
      están sujetos a revisión: yo lo llevo con guía, y si todo está
      conforme me ponen un sello y firma de almacén, y con la guía sellada
      recién puedo facturar»*. Sale cuando se reimprime después de
      facturar, que es cuando alguien quiere saber qué factura salió de
      esta entrega.
    */
    g.comprobante
      ? { etiqueta: "Comprobante", valor: g.comprobante.numero }
      : null,
    g.cotizacion_numero
      ? { etiqueta: "Cotización", valor: g.cotizacion_numero }
      : null,
    g.orden_compra_cliente
      ? { etiqueta: "O/C del cliente", valor: g.orden_compra_cliente }
      : null,
  ];
}

/** El transporte del pie, como pares «etiqueta: valor». */
export function transporteDeGuia(g: GuiaDetalle): { etiqueta: string; valor: string }[] {
  const publico = g.modalidad_traslado === "01";
  return [
    ...(publico
      ? [
          { etiqueta: "Transportista", valor: g.transportista_razon_social ?? "—" },
          { etiqueta: "RUC", valor: g.transportista_documento ?? "—" },
        ]
      : []),
    g.a_pie
      ? { etiqueta: "Traslado", valor: "a pie, sin vehículo" }
      : { etiqueta: "Placa", valor: g.transportista_placa ?? "—" },
    { etiqueta: g.a_pie ? "Lo lleva" : "Conductor", valor: g.conductor_nombre ?? "—" },
    { etiqueta: "DNI", valor: g.conductor_documento ?? "—" },
    ...(g.a_pie
      ? g.conductor_telefono
        ? [{ etiqueta: "Celular", valor: g.conductor_telefono }]
        : []
      : [{ etiqueta: "Licencia", valor: g.conductor_licencia ?? "—" }]),
  ];
}

export function hojaDeGuia(g: GuiaDetalle, emisor: EmisorHoja): HojaPdf {
  const pie: BloquePiePdf[] = [{ tipo: "campos", campos: transporteDeGuia(g) }];
  if (g.observaciones) pie.push({ tipo: "parrafo", trozos: [{ texto: g.observaciones }] });
  pie.push({ tipo: "sello", texto: "Sello y firma de recepción" });
  return {
    emisor,
    // Un borrador no puede salir igual que una guía emitida (auditoría 14/10).
    titulo: g.estado === "borrador" ? "Guía de remisión · BORRADOR, sin validez" : "Guía de remisión electrónica · Remitente",
    numero: g.numero,
    datos: datosDeGuia(g),
    columnas: [
      { clave: "n", titulo: "#", alinear: "centro" },
      { clave: "codigo", titulo: "Código" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "cantidad", titulo: "Cant.", alinear: "derecha" },
      { clave: "unidad", titulo: "U.M.", alinear: "centro" },
    ],
    filas: g.lineas.map((l, i) => ({
      n: String(i + 1),
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      unidad: l.unidad,
    })),
    pie,
  };
}
