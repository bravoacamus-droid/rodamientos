import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { armarListadoPdf } from "@/lib/pdf-listado";

import { datosCompras } from "./ejecutivo";

/**
 * El Excel del reporte de compras (133): una hoja por línea comprada y las
 * tres respuestas del reporte —por proveedor, por producto y el mejor
 * precio— para que Willy las filtre y las ordene a su manera.
 *
 * Todo en dólares y sin IGV, como la pantalla; la compra en soles se pasa con
 * su propio tipo de cambio.
 */

const AZUL = "FF0E4C73";
const DINERO = '"$" #,##0.00';
const VIA: Record<string, string> = { local: "Local", aerea: "Aérea", maritima: "Marítima", importacion: "Importación" };

const fechaExcel = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!));
};

export async function libroCompras(opciones: {
  desde: string;
  hasta: string;
  proveedor: string | null;
  descripcionRango: string;
}): Promise<Buffer> {
  const { desde, hasta, proveedor } = opciones;
  const supabase = await clienteServidor();

  let consulta = supabase
    .from("compras")
    .select(
      `numero, fecha, estado, tipo, via_importacion, moneda, tipo_cambio, documento_proveedor, falta_factura,
       proveedores(razon_social, numero_documento),
       pedido:pedidos!compras_pedido_id_fkey(numero),
       compra_items(cantidad, cantidad_recibida, costo_unitario, importe, productos(codigo, descripcion, marcas(nombre)))`,
    )
    .neq("estado", "anulada")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .limit(5000);
  if (proveedor) consulta = consulta.eq("proveedor_id", proveedor);
  const [{ data: compras, error }, resumen] = await Promise.all([
    consulta,
    datosCompras({ desde, hasta, grano: "mes" }, proveedor),
  ]);
  if (error) throw new Error(error.message);

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();
  const cabecera = (h: import("exceljs").Worksheet) => {
    h.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  };

  // ----------------------------------------------------------- Detalle --
  const detalle = wb.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  detalle.columns = [
    { header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Compra", width: 15 },
    { header: "Pedido", width: 15 },
    { header: "Proveedor", width: 38 },
    { header: "RUC", width: 14 },
    { header: "Vía", width: 12 },
    { header: "Factura del proveedor", width: 18 },
    { header: "Código", width: 18 },
    { header: "Descripción", width: 44 },
    { header: "Marca", width: 12 },
    { header: "Cantidad", width: 10 },
    { header: "Recibido", width: 10 },
    { header: "Costo unitario (US$)", width: 16, style: { numFmt: DINERO } },
    { header: "Importe (US$)", width: 14, style: { numFmt: DINERO } },
    { header: "Estado", width: 22 },
  ];
  cabecera(detalle);
  for (const c of (compras ?? []) as unknown as {
    numero: string;
    fecha: string;
    estado: string;
    tipo: string;
    via_importacion: string | null;
    moneda: string;
    tipo_cambio: number | null;
    documento_proveedor: string | null;
    falta_factura: boolean;
    proveedores: { razon_social: string; numero_documento: string | null } | null;
    pedido: { numero: string } | null;
    compra_items: {
      cantidad: number;
      cantidad_recibida: number;
      costo_unitario: number;
      importe: number;
      productos: { codigo: string; descripcion: string; marcas: { nombre: string } | null } | null;
    }[];
  }[]) {
    const aUsd = c.moneda === "USD" || !(Number(c.tipo_cambio) > 0) ? 1 : 1 / Number(c.tipo_cambio);
    const via = c.tipo === "local" ? "local" : (c.via_importacion ?? "importacion");
    const estado = c.falta_factura
      ? "Orden: falta registrar"
      : c.estado === "registrada"
        ? "Por recibir"
        : c.estado === "recibida_parcial"
          ? "Recibida en parte"
          : "Recibida";
    for (const i of c.compra_items ?? []) {
      detalle.addRow([
        fechaExcel(c.fecha),
        c.numero,
        c.pedido?.numero ?? "",
        c.proveedores?.razon_social ?? "",
        c.proveedores?.numero_documento ?? "",
        VIA[via] ?? via,
        c.documento_proveedor ?? "",
        i.productos?.codigo ?? "",
        i.productos?.descripcion ?? "",
        i.productos?.marcas?.nombre ?? "",
        Number(i.cantidad),
        Number(i.cantidad_recibida ?? 0),
        Math.round(Number(i.costo_unitario) * aUsd * 10000) / 10000,
        Math.round(Number(i.importe) * aUsd * 100) / 100,
        estado,
      ]);
    }
  }
  detalle.autoFilter = { from: "A1", to: "O1" };

  if (resumen.ok) {
    const d = resumen.datos;
    // ------------------------------------------------------ Por proveedor --
    const prov = wb.addWorksheet("Por proveedor", { views: [{ state: "frozen", ySplit: 1 }] });
    prov.columns = [
      { header: "Proveedor", width: 40 },
      { header: "Compras", width: 10 },
      { header: "Comprado (US$)", width: 16, style: { numFmt: DINERO } },
      { header: "Parte del total", width: 12, style: { numFmt: "0.0%" } },
      { header: "Días de entrega (promedio)", width: 16 },
      { header: "Última compra", width: 14, style: { numFmt: "dd/mm/yyyy" } },
    ];
    cabecera(prov);
    for (const x of d.proveedores) {
      prov.addRow([
        x.proveedor,
        x.compras,
        x.monto,
        d.resumen.comprado > 0 ? x.monto / d.resumen.comprado : 0,
        x.diasEntrega ?? "",
        fechaExcel(x.ultima),
      ]);
    }

    // ------------------------------------------------------- Por producto --
    const prod = wb.addWorksheet("Por producto", { views: [{ state: "frozen", ySplit: 1 }] });
    prod.columns = [
      { header: "Código", width: 18 },
      { header: "Descripción", width: 44 },
      { header: "Marca", width: 12 },
      { header: "Unidades", width: 10 },
      { header: "Comprado (US$)", width: 16, style: { numFmt: DINERO } },
      { header: "Veces", width: 8 },
      { header: "Proveedores", width: 12 },
      { header: "Costo promedio (US$)", width: 16, style: { numFmt: DINERO } },
    ];
    cabecera(prod);
    for (const x of d.productos) {
      prod.addRow([x.codigo, x.descripcion, x.marca ?? "", x.unidades, x.monto, x.veces, x.proveedores, x.costoPromedio]);
    }

    // ------------------------------------------------------ Mejor precio --
    const mejor = wb.addWorksheet("Mejor precio", { views: [{ state: "frozen", ySplit: 1 }] });
    mejor.columns = [
      { header: "Código", width: 18 },
      { header: "Descripción", width: 40 },
      { header: "El más barato", width: 34 },
      { header: "Su costo (US$)", width: 14, style: { numFmt: DINERO } },
      { header: "El más caro", width: 34 },
      { header: "Su costo (US$)", width: 14, style: { numFmt: DINERO } },
      { header: "Diferencia", width: 12, style: { numFmt: "0.0%" } },
      { header: "Proveedores conocidos", width: 12 },
    ];
    cabecera(mejor);
    for (const x of d.mejorPrecio) {
      mejor.addRow([x.codigo, x.descripcion, x.proveedorMejor, x.mejor, x.proveedorPeor, x.peor, x.diferencia / 100, x.proveedores]);
    }
  }

  const datos = await wb.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}

/**
 * Lo mismo en PDF (26/11), con los mismos filtros (periodo y proveedor). En
 * papel va un renglón por compra y, debajo, por proveedor, por producto y el
 * mejor precio. El detalle línea por línea se queda en el Excel.
 */
export async function pdfCompras(opciones: {
  desde: string;
  hasta: string;
  proveedor: string | null;
  nombreProveedor: string | null;
  descripcionRango: string;
}): Promise<ArrayBuffer> {
  const { desde, hasta, proveedor } = opciones;
  const supabase = await clienteServidor();
  let consulta = supabase
    .from("compras")
    .select(
      `numero, fecha, estado, moneda, tipo_cambio, documento_proveedor, falta_factura,
       proveedores(razon_social),
       compra_items(importe)`,
    )
    .neq("estado", "anulada")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("numero")
    .limit(5000);
  if (proveedor) consulta = consulta.eq("proveedor_id", proveedor);
  const [{ data, error }, resumen] = await Promise.all([consulta, datosCompras({ desde, hasta, grano: "mes" }, proveedor)]);
  if (error) throw new Error(error.message);

  const usd = (n: number) => `$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fecha = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
  };
  const filas = ((data ?? []) as unknown as {
    numero: string;
    fecha: string;
    estado: string;
    moneda: string;
    tipo_cambio: number | null;
    documento_proveedor: string | null;
    falta_factura: boolean;
    proveedores: { razon_social: string } | null;
    compra_items: { importe: number }[];
  }[]).map((c) => {
    const aUsd = c.moneda === "USD" || !(Number(c.tipo_cambio) > 0) ? 1 : 1 / Number(c.tipo_cambio);
    const importe = Math.round((c.compra_items ?? []).reduce((a, i) => a + Number(i.importe), 0) * aUsd * 100) / 100;
    const estado = c.falta_factura
      ? "Falta registrar"
      : c.estado === "registrada"
        ? "Por recibir"
        : c.estado === "recibida_parcial"
          ? "Recibida en parte"
          : "Recibida";
    return { ...c, importe, estadoTexto: estado };
  });
  const total = filas.reduce((a, f) => a + f.importe, 0);
  const d = resumen.ok ? resumen.datos : null;
  const TOPE = 100;

  const doc = await armarListadoPdf({
    titulo: "Lo comprado",
    empresa: "Inversiones Rodatech E.I.R.L.",
    subtitulo: [opciones.descripcionRango, opciones.nombreProveedor ?? "todos los proveedores", "en dólares, sin IGV"].join(" · "),
    resumen: [
      { etiqueta: "Compras", valor: filas.length.toLocaleString("es-PE") },
      { etiqueta: "Proveedores", valor: String(d?.proveedores.length ?? new Set(filas.map((f) => f.proveedores?.razon_social)).size) },
      { etiqueta: "Comprado", valor: usd(total) },
    ],
    columnas: [
      { titulo: "Fecha", ancho: 20 },
      { titulo: "Compra", ancho: 28 },
      { titulo: "Proveedor" },
      { titulo: "Factura del proveedor", ancho: 40 },
      { titulo: "Estado", ancho: 30 },
      { titulo: "Importe", ancho: 30, derecha: true },
    ],
    filas: filas.map((f) => [fecha(f.fecha), f.numero, f.proveedores?.razon_social ?? "", f.documento_proveedor ?? "", f.estadoTexto, usd(f.importe)]),
    pie: filas.length > 0 ? ["", "", "Total", "", "", usd(total)] : undefined,
    secciones: d
      ? [
          {
            titulo: "Por proveedor",
            columnas: [
              { titulo: "Proveedor" },
              { titulo: "Compras", ancho: 20, derecha: true },
              { titulo: "Comprado", ancho: 32, derecha: true },
              { titulo: "Parte del total", ancho: 26, derecha: true },
              { titulo: "Última compra", ancho: 26 },
            ],
            filas: d.proveedores.map((x) => [
              x.proveedor,
              String(x.compras),
              usd(x.monto),
              d.resumen.comprado > 0 ? `${((x.monto / d.resumen.comprado) * 100).toFixed(1)} %` : "",
              fecha(x.ultima),
            ]),
          },
          {
            titulo: d.productos.length > TOPE ? `Por producto (los ${TOPE} de más importe; el resto en el Excel)` : "Por producto",
            columnas: [
              { titulo: "Código", ancho: 34 },
              { titulo: "Descripción" },
              { titulo: "Marca", ancho: 24 },
              { titulo: "Unidades", ancho: 20, derecha: true },
              { titulo: "Comprado", ancho: 30, derecha: true },
              { titulo: "Costo promedio", ancho: 28, derecha: true },
            ],
            filas: d.productos.slice(0, TOPE).map((x) => [
              x.codigo,
              x.descripcion,
              x.marca ?? "",
              x.unidades.toLocaleString("es-PE", { maximumFractionDigits: 2 }),
              usd(x.monto),
              usd(x.costoPromedio),
            ]),
          },
          {
            titulo: "Mejor precio",
            columnas: [
              { titulo: "Código", ancho: 32 },
              { titulo: "Descripción" },
              { titulo: "El más barato", ancho: 46 },
              { titulo: "Costo", ancho: 22, derecha: true },
              { titulo: "El más caro", ancho: 46 },
              { titulo: "Costo", ancho: 22, derecha: true },
            ],
            filas: d.mejorPrecio.slice(0, TOPE).map((x) => [x.codigo, x.descripcion, x.proveedorMejor, usd(x.mejor), x.proveedorPeor, usd(x.peor)]),
          },
        ]
      : undefined,
    nota: filas.length === 0 ? "Ninguna compra con estos filtros." : undefined,
  });
  return doc.output("arraybuffer");
}
