import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";
import { filasDePedidos } from "@/modules/pedidos/api/consultas";
import { ETIQUETA_ETAPA } from "@/modules/pedidos/dominio/etapa";
import { margenPct, sunatDe } from "@/modules/pedidos/dominio/lista";

/**
 * El detalle de lo vendido o lo cotizado, como libro de Excel (105).
 *
 * Willy, 06/10 (4:00): *«de todas las ventas por detalle o las cotizaciones,
 * para hacer un estudio, un análisis de consumo de productos y ver una
 * compra»*.
 *
 * Tres hojas, porque son las tres preguntas de un análisis de consumo:
 *
 *  · **Detalle** — cada línea, con su documento, su cliente y la familia del
 *    producto. Con autofiltro, y con totales hechos con SUBTOTAL: al filtrar
 *    un cliente o una familia en Excel, el total cambia con el filtro.
 *  · **Por producto** — cuánto se llevó de cada código y cuántos clientes.
 *  · **Por cliente** — cuánto compró cada uno y de cuántos productos.
 *
 * Se arma en el servidor, como el del análisis de importación: ExcelJS pesa
 * cerca de un mega y en el navegador lo pagaría cualquiera que abra el ERP.
 */

export type TipoDetalle = "ventas" | "cotizaciones";

interface Linea {
  fecha: string;
  numero: string;
  estado: string;
  cliente: string;
  documento: string | null;
  vendedor: string | null;
  codigo: string;
  descripcion: string;
  marca: string | null;
  familia: string | null;
  subfamilia: string | null;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
  descuentoPct: number;
  importe: number;
  // Solo ventas
  tipo?: string;
  condicion?: string;
  ordenCompra?: string | null;
  igv?: number;
  // Solo cotizaciones
  vence?: string | null;
  cantidadAprobada?: number | null;
  entrega?: string | null;
}

const ESTADO_VENTA: Record<string, string> = {
  emitido: "Por cobrar",
  parcial: "Cobrada en parte",
  pagado: "Cobrada",
  vencido: "Vencida",
};

const ESTADO_COTIZACION: Record<string, string> = {
  borrador: "Sin enviar",
  enviada: "Enviada",
  aprobada: "Aprobada",
  atendida: "Atendida",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

/** Hasta mil filas por llamada: es el tope de PostgREST, y aquí hay más. */
const PAGINA = 1000;

async function leerLineas(
  tipo: TipoDetalle,
  desde: string,
  hasta: string,
  cliente: string | null,
): Promise<Linea[]> {
  const supabase = await clienteServidor();
  const args = { p_desde: desde, p_hasta: hasta, ...(cliente ? { p_cliente: cliente } : {}) };
  const salida: Linea[] = [];
  const n = (v: unknown) => Number(v ?? 0);

  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const consulta =
      tipo === "ventas"
        ? supabase.rpc("detalle_ventas", args).range(desdeFila, desdeFila + PAGINA - 1)
        : supabase.rpc("detalle_cotizaciones", args).range(desdeFila, desdeFila + PAGINA - 1);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as Record<string, unknown>[];
    for (const f of filas) {
      salida.push({
        fecha: String(f.fecha),
        numero: String(f.numero ?? ""),
        estado: String(f.estado ?? ""),
        cliente: String(f.cliente ?? ""),
        documento: (f.documento as string | null) ?? null,
        vendedor: (f.vendedor as string | null) ?? null,
        codigo: String(f.codigo ?? ""),
        descripcion: String(f.descripcion ?? ""),
        marca: (f.marca as string | null) ?? null,
        familia: (f.familia as string | null) ?? null,
        subfamilia: (f.subfamilia as string | null) ?? null,
        unidad: String(f.unidad ?? ""),
        cantidad: n(f.cantidad),
        valorUnitario: n(f.valor_unitario),
        descuentoPct: n(f.descuento_pct),
        importe: n(f.importe),
        tipo: f.tipo as string | undefined,
        condicion: f.condicion as string | undefined,
        ordenCompra: (f.orden_compra as string | null | undefined) ?? null,
        igv: f.igv === undefined ? undefined : n(f.igv),
        vence: (f.vence as string | null | undefined) ?? null,
        cantidadAprobada: f.cantidad_aprobada === undefined || f.cantidad_aprobada === null ? null : n(f.cantidad_aprobada),
        entrega: (f.entrega as string | null | undefined) ?? null,
      });
    }
    if (filas.length < PAGINA) break;
  }
  return salida;
}

/** Una fecha ISO como fecha de Excel, sin que la zona horaria la corra un día. */
function fechaExcel(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

const DINERO = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const CANTIDAD = "#,##0.##;[Red]-#,##0.##";
const AZUL = "FF0E4C73";

export async function libroDetalle(opciones: {
  tipo: TipoDetalle;
  desde: string;
  hasta: string;
  cliente: string | null;
  nombreCliente: string | null;
  descripcionRango: string;
  /**
   * Los filtros de la lista de cotizaciones (14/10): el botón «Exportar a
   * Excel» baja lo que se está viendo. Se filtra aquí, sobre lo que trae la
   * RPC, para no tocar `detalle_cotizaciones`.
   */
  estado?: string | null;
  serie?: string | null;
}): Promise<{ libro: Buffer; lineas: number }> {
  const { tipo, desde, hasta, cliente, nombreCliente, descripcionRango, estado, serie } = opciones;
  const lineas = (await leerLineas(tipo, desde, hasta, cliente)).filter(
    (l) => (!estado || l.estado === estado) && (!serie || l.numero.startsWith(`${serie}-`)),
  );

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  const titulo = tipo === "ventas" ? "Ventas, línea por línea" : "Cotizaciones, línea por línea";
  const filtro = `${descripcionRango} · ${nombreCliente ?? "todos los clientes"}`;

  // --------------------------------------------------------------- Detalle --
  type Col = { titulo: string; ancho: number; valor: (l: Linea) => unknown; formato?: string; suma?: boolean };
  const columnas: Col[] =
    tipo === "ventas"
      ? [
          { titulo: "Fecha", ancho: 12, valor: (l) => fechaExcel(l.fecha), formato: "dd/mm/yyyy" },
          { titulo: "Tipo", ancho: 15, valor: (l) => l.tipo },
          { titulo: "Número", ancho: 15, valor: (l) => l.numero },
          { titulo: "Cobro", ancho: 15, valor: (l) => ESTADO_VENTA[l.estado] ?? l.estado },
          { titulo: "Condición", ancho: 11, valor: (l) => (l.condicion === "credito" ? "Crédito" : "Contado") },
          { titulo: "Orden de compra", ancho: 16, valor: (l) => l.ordenCompra ?? "" },
          { titulo: "Cliente", ancho: 38, valor: (l) => l.cliente },
          { titulo: "RUC / DNI", ancho: 14, valor: (l) => l.documento ?? "" },
          { titulo: "Código", ancho: 18, valor: (l) => l.codigo },
          { titulo: "Descripción", ancho: 48, valor: (l) => l.descripcion },
          { titulo: "Marca", ancho: 14, valor: (l) => l.marca ?? "" },
          { titulo: "Familia", ancho: 16, valor: (l) => l.familia ?? "" },
          { titulo: "Subfamilia", ancho: 20, valor: (l) => l.subfamilia ?? "" },
          { titulo: "Unidad", ancho: 8, valor: (l) => l.unidad },
          { titulo: "Cantidad", ancho: 11, valor: (l) => l.cantidad, formato: CANTIDAD, suma: true },
          { titulo: "Valor unitario", ancho: 14, valor: (l) => l.valorUnitario, formato: DINERO },
          { titulo: "Dscto. %", ancho: 9, valor: (l) => l.descuentoPct, formato: "0.##" },
          { titulo: "Importe sin IGV", ancho: 16, valor: (l) => l.importe, formato: DINERO, suma: true },
          { titulo: "IGV", ancho: 13, valor: (l) => l.igv ?? 0, formato: DINERO, suma: true },
          { titulo: "Vendedor", ancho: 18, valor: (l) => l.vendedor ?? "" },
        ]
      : [
          { titulo: "Fecha", ancho: 12, valor: (l) => fechaExcel(l.fecha), formato: "dd/mm/yyyy" },
          { titulo: "Número", ancho: 15, valor: (l) => l.numero },
          { titulo: "Estado", ancho: 13, valor: (l) => ESTADO_COTIZACION[l.estado] ?? l.estado },
          { titulo: "Vence", ancho: 12, valor: (l) => (l.vence ? fechaExcel(l.vence) : ""), formato: "dd/mm/yyyy" },
          { titulo: "Cliente", ancho: 38, valor: (l) => l.cliente },
          { titulo: "RUC / DNI", ancho: 14, valor: (l) => l.documento ?? "" },
          { titulo: "Código", ancho: 18, valor: (l) => l.codigo },
          { titulo: "Descripción", ancho: 48, valor: (l) => l.descripcion },
          { titulo: "Marca", ancho: 14, valor: (l) => l.marca ?? "" },
          { titulo: "Familia", ancho: 16, valor: (l) => l.familia ?? "" },
          { titulo: "Subfamilia", ancho: 20, valor: (l) => l.subfamilia ?? "" },
          { titulo: "Unidad", ancho: 8, valor: (l) => l.unidad },
          { titulo: "Cantidad", ancho: 11, valor: (l) => l.cantidad, formato: CANTIDAD, suma: true },
          { titulo: "Valor unitario", ancho: 14, valor: (l) => l.valorUnitario, formato: DINERO },
          { titulo: "Dscto. %", ancho: 9, valor: (l) => l.descuentoPct, formato: "0.##" },
          { titulo: "Importe sin IGV", ancho: 16, valor: (l) => l.importe, formato: DINERO, suma: true },
          { titulo: "Cant. aprobada", ancho: 14, valor: (l) => l.cantidadAprobada ?? "", formato: CANTIDAD },
          { titulo: "Entrega", ancho: 22, valor: (l) => l.entrega ?? "" },
          { titulo: "Vendedor", ancho: 18, valor: (l) => l.vendedor ?? "" },
        ];

  const FILA_TITULOS = 4;
  const hoja = wb.addWorksheet("Detalle", {
    views: [{ state: "frozen", ySplit: FILA_TITULOS }],
  });
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));

  hoja.getCell("A1").value = titulo;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value = `${filtro} · ${lineas.length.toLocaleString("es-PE")} líneas`;
  hoja.getCell("A2").font = { size: 12, color: { argb: "FF5C6773" } };

  const cabecera = hoja.getRow(FILA_TITULOS);
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { vertical: "middle", wrapText: true };
  });
  cabecera.height = 30;

  lineas.forEach((l, i) => {
    const fila = hoja.getRow(FILA_TITULOS + 1 + i);
    columnas.forEach((c, j) => {
      const celda = fila.getCell(j + 1);
      celda.value = c.valor(l) as never;
      if (c.formato) celda.numFmt = c.formato;
    });
  });

  const ultima = FILA_TITULOS + lineas.length;
  if (lineas.length > 0) {
    hoja.autoFilter = {
      from: { row: FILA_TITULOS, column: 1 },
      to: { row: ultima, column: columnas.length },
    };
    // SUBTOTAL(109, …) y no SUMA: suma solo lo que queda visible al filtrar.
    const total = hoja.getRow(ultima + 2);
    total.getCell(1).value = "Total de lo filtrado";
    total.getCell(1).font = { bold: true };
    columnas.forEach((c, j) => {
      if (!c.suma) return;
      const letra = hoja.getColumn(j + 1).letter;
      const celda = total.getCell(j + 1);
      celda.value = { formula: `SUBTOTAL(109,${letra}${FILA_TITULOS + 1}:${letra}${ultima})` };
      celda.numFmt = c.formato ?? "";
      celda.font = { bold: true };
      celda.border = { top: { style: "thin" } };
    });
  }

  // ---------------------------------------------------------- Por producto --
  const porProducto = new Map<
    string,
    { codigo: string; descripcion: string; marca: string; familia: string; cantidad: number; importe: number; clientes: Set<string>; documentos: Set<string>; ultima: string }
  >();
  for (const l of lineas) {
    const p = porProducto.get(l.codigo) ?? {
      codigo: l.codigo,
      descripcion: l.descripcion,
      marca: l.marca ?? "",
      familia: l.familia ?? "",
      cantidad: 0,
      importe: 0,
      clientes: new Set<string>(),
      documentos: new Set<string>(),
      ultima: l.fecha,
    };
    p.cantidad += l.cantidad;
    p.importe += l.importe;
    p.clientes.add(l.cliente);
    p.documentos.add(l.numero);
    if (l.fecha > p.ultima) p.ultima = l.fecha;
    porProducto.set(l.codigo, p);
  }

  const hojaProductos = wb.addWorksheet("Por producto", { views: [{ state: "frozen", ySplit: 1 }] });
  hojaProductos.columns = [
    { header: "Código", width: 18 },
    { header: "Descripción", width: 48 },
    { header: "Marca", width: 14 },
    { header: "Familia", width: 16 },
    { header: "Cantidad", width: 12, style: { numFmt: CANTIDAD } },
    { header: "Importe sin IGV", width: 16, style: { numFmt: DINERO } },
    { header: "Clientes", width: 10 },
    { header: "Documentos", width: 12 },
    { header: tipo === "ventas" ? "Última venta" : "Última cotización", width: 16, style: { numFmt: "dd/mm/yyyy" } },
  ];
  for (const p of [...porProducto.values()].sort((a, b) => b.importe - a.importe)) {
    hojaProductos.addRow([
      p.codigo,
      p.descripcion,
      p.marca,
      p.familia,
      p.cantidad,
      p.importe,
      p.clientes.size,
      p.documentos.size,
      fechaExcel(p.ultima),
    ]);
  }

  // ----------------------------------------------------------- Por cliente --
  const porCliente = new Map<
    string,
    { cliente: string; documento: string; importe: number; documentos: Set<string>; productos: Set<string>; ultima: string }
  >();
  for (const l of lineas) {
    const c = porCliente.get(l.cliente) ?? {
      cliente: l.cliente,
      documento: l.documento ?? "",
      importe: 0,
      documentos: new Set<string>(),
      productos: new Set<string>(),
      ultima: l.fecha,
    };
    c.importe += l.importe;
    c.documentos.add(l.numero);
    c.productos.add(l.codigo);
    if (l.fecha > c.ultima) c.ultima = l.fecha;
    porCliente.set(l.cliente, c);
  }

  const hojaClientes = wb.addWorksheet("Por cliente", { views: [{ state: "frozen", ySplit: 1 }] });
  hojaClientes.columns = [
    { header: "Cliente", width: 40 },
    { header: "RUC / DNI", width: 14 },
    { header: "Importe sin IGV", width: 16, style: { numFmt: DINERO } },
    { header: "Documentos", width: 12 },
    { header: "Productos distintos", width: 18 },
    { header: tipo === "ventas" ? "Última compra" : "Última cotización", width: 16, style: { numFmt: "dd/mm/yyyy" } },
  ];
  for (const c of [...porCliente.values()].sort((a, b) => b.importe - a.importe)) {
    hojaClientes.addRow([c.cliente, c.documento, c.importe, c.documentos.size, c.productos.size, fechaExcel(c.ultima)]);
  }

  for (const h of [hojaProductos, hojaClientes]) {
    const r = h.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    r.height = 24;
    if (h.rowCount > 1) {
      h.autoFilter = { from: { row: 1, column: 1 }, to: { row: h.rowCount, column: h.columnCount } };
    }
  }

  // ------------------------------------------------------------- Facturas --
  /*
    Una fila por documento, con la retención y su CR (Willy, 14/10: «en el
    reporte en Excel del listado de facturas debe aparecer [si tiene
    retención]… para hacerle seguimiento»). El total va en la moneda del
    documento y además en dólares, que es como suman los reportes.
  */
  if (tipo === "ventas") {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("comprobantes")
      .select(
        `numero, tipo, fecha_emision, estado, total, saldo, moneda, pen_total, orden_compra_cliente,
         retencion_aplica, retencion_monto, pen_retencion,
         clientes(razon_social, numero_documento),
         pedido:pedidos!comprobantes_pedido_id_fkey(numero),
         comprobante_retenciones(numero_cr)`,
      )
      .gte("fecha_emision", desde)
      .lte("fecha_emision", hasta)
      .order("fecha_emision")
      .limit(5000);
    if (cliente) consulta = consulta.eq("cliente_id", cliente);
    const { data: docs } = await consulta;
    const hojaFacturas = wb.addWorksheet("Facturas", { views: [{ state: "frozen", ySplit: 1 }] });
    hojaFacturas.columns = [
      { header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Tipo", width: 15 },
      { header: "Número", width: 15 },
      { header: "Cliente", width: 40 },
      { header: "RUC / DNI", width: 14 },
      { header: "Orden de compra", width: 16 },
      // De qué pedido viene (130): lo facturado se cruza con lo vendido.
      { header: "Pedido", width: 15 },
      { header: "Moneda", width: 8 },
      { header: "Total (moneda del documento)", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "Total en dólares", width: 16, style: { numFmt: DINERO } },
      { header: "Retención", width: 10 },
      { header: "Monto retenido (moneda del documento)", width: 20, style: { numFmt: "#,##0.00" } },
      { header: "CR", width: 14 },
      { header: "Cobro", width: 15 },
    ];
    hojaFacturas.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hojaFacturas.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    const n = (v: unknown) => Number(v ?? 0);
    for (const d of (docs ?? []) as Record<string, unknown>[]) {
      const enSoles = d.moneda === "PEN" && d.pen_total != null;
      const cli = d.clientes as { razon_social?: string; numero_documento?: string } | null;
      const retiene = Boolean(d.retencion_aplica);
      const cr = d.comprobante_retenciones as { numero_cr?: string | null } | null;
      hojaFacturas.addRow([
        fechaExcel(String(d.fecha_emision)),
        d.tipo === "nota_credito" ? "Nota de crédito" : d.tipo === "nota_debito" ? "Nota de débito" : "Factura",
        String(d.numero),
        cli?.razon_social ?? "",
        cli?.numero_documento ?? "",
        (d.orden_compra_cliente as string | null) ?? "",
        (d.pedido as { numero?: string } | null)?.numero ?? "",
        enSoles ? "PEN" : "USD",
        enSoles ? n(d.pen_total) : n(d.total),
        n(d.total),
        retiene ? "Sí" : "No",
        retiene ? (enSoles ? n(d.pen_retencion) : n(d.retencion_monto)) : "",
        retiene ? (cr ? (cr.numero_cr ? `Registrado ${cr.numero_cr}` : "Registrado") : "Falta") : "",
        d.estado === "anulado" ? "Anulado" : (ESTADO_VENTA[String(d.estado)] ?? String(d.estado)),
      ]);
    }
  }

  // -------------------------------------------------------------- Pedidos --
  /*
    Una fila por pedido del periodo (130-132), con las columnas de la tabla
    de Pedidos: lo vendido, su margen y en qué va. Luis, 15/10: *«ahí es
    cuando una venta ya se concretó»*.
  */
  {
    const r = await filasDePedidos({ desde, hasta });
    const filas = r.ok ? r.datos.filter((p) => !cliente || p.clienteId === cliente) : [];
    const hojaPedidos = wb.addWorksheet("Pedidos", { views: [{ state: "frozen", ySplit: 1 }] });
    hojaPedidos.columns = [
      { header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Pedido", width: 15 },
      { header: "Cotización", width: 15 },
      { header: "Cliente", width: 40 },
      { header: "Repetido", width: 10 },
      { header: "Productos", width: 40 },
      { header: "Venta sin IGV (US$)", width: 16, style: { numFmt: DINERO } },
      { header: "Costo analizado (US$)", width: 16, style: { numFmt: DINERO } },
      { header: "Margen sobre el costo", width: 12, style: { numFmt: "0.0%" } },
      { header: "Compras", width: 16 },
      { header: "Guía", width: 15 },
      { header: "Factura", width: 15 },
      { header: "Debe (US$)", width: 14, style: { numFmt: DINERO } },
      { header: "SUNAT", width: 12 },
      { header: "Etapa", width: 26 },
    ];
    hojaPedidos.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hojaPedidos.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    const SUNAT_TEXTO = { aceptado: "Aceptada", pendiente: "Sin enviar", rechazado: "Rechazada", sin_factura: "" } as const;
    for (const p of [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))) {
      const margen = margenPct(p.venta, p.costo);
      hojaPedidos.addRow([
        fechaExcel(p.fecha),
        p.numero,
        p.cotizacion,
        p.cliente,
        p.secuencia > 1 ? "Sí" : "No",
        p.productos.map((x) => `${x.codigo} × ${x.cantidad}`).join(" · "),
        p.venta,
        p.costo > 0 ? p.costo : "",
        margen === null ? "" : margen / 100,
        p.compras.total === 0 ? "Sin órdenes" : `${p.compras.total - p.compras.porRegistrar} de ${p.compras.total} compradas`,
        p.guia?.emitida ? p.guia.numero : "",
        p.facturas.map((f) => f.numero).join(", "),
        p.facturas.length > 0 ? p.facturas.reduce((a, f) => a + f.saldoUsd, 0) : "",
        SUNAT_TEXTO[sunatDe(p)],
        ETIQUETA_ETAPA[p.etapa],
      ]);
    }
  }

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), lineas: lineas.length };
}
