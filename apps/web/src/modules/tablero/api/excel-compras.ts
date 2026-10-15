import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

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
