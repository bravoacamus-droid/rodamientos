import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import {
  filaCompra,
  filaRegistro,
  nombreMes,
  separarCompras,
  sinSeriesDePrueba,
  totalesRegistro,
  type ComprobanteContable,
  type CompraContable,
  type FilaRegistro,
  type OrdenSinFactura,
} from "../dominio/contador";

/**
 * El Excel del mes para el contador: ventas y compras en soles.
 *
 * Tres hojas: **Ventas** y **Compras**, una fila por documento con las
 * columnas que lleva cada registro, y **Léeme**, con los totales y lo que
 * falta —documentos sin cambio— dicho en castellano, para que el contador no
 * lo descubra al cuadrar.
 *
 * Y dos cosas que NO van al registro (157), dichas en vez de calladas: los
 * documentos de las series de prueba (se cuentan en «Léeme») y las órdenes
 * de compra sin factura del proveedor (van a su propia hoja, «Órdenes sin
 * factura del proveedor», para pedírsela).
 *
 * El cambio de cada documento en dólares sale de la factura (148) y, si no lo
 * tiene, del día en `tipos_cambio_sunat` (149), con el último publicado para
 * domingos y feriados. Las notas usan el de su comprobante.
 */

const AZUL = "FF0E4C73";
const SOLES = '"S/ "#,##0.00;[Red]-"S/ "#,##0.00';
const NUMERO = "#,##0.00;[Red]-#,##0.00";

function fechaExcel(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

type Uno<T> = T | T[] | null | undefined;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** El cambio de cada día del rango, más una semana antes para los lunes. */
async function cambiosDelRango(desde: string, hasta: string): Promise<(fecha: string) => number | null> {
  const supabase = await clienteServidor();
  const antes = new Date(`${desde}T12:00:00Z`);
  antes.setUTCDate(antes.getUTCDate() - 7);
  const { data, error } = await supabase
    .from("tipos_cambio_sunat")
    .select("fecha, venta")
    .gte("fecha", antes.toISOString().slice(0, 10))
    .lte("fecha", hasta)
    .order("fecha");
  if (error) throw new Error(error.message);
  const dias = (data ?? []).map((d) => ({ fecha: String(d.fecha), venta: Number(d.venta) }));
  return (fecha) => {
    // El del día o el último publicado antes, como `cambio_sunat_del_dia`.
    let elegido: number | null = null;
    for (const d of dias) {
      if (d.fecha > fecha) break;
      elegido = d.venta;
    }
    return elegido;
  };
}

/** Las series marcadas `es_prueba` (093): sus documentos no son ventas. */
async function seriesDePrueba(): Promise<Set<string>> {
  const supabase = await clienteServidor();
  const { data, error } = await supabase.from("series_documento").select("serie").eq("es_prueba", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((s) => String(s.serie)));
}

async function leerVentas(
  desde: string,
  hasta: string,
  cambio: (f: string) => number | null,
): Promise<{ filas: FilaRegistro[]; omitidos: number }> {
  const supabase = await clienteServidor();
  const [{ data: todos, error }, prueba] = await Promise.all([
    supabase
      .from("comprobantes")
      .select(
        `tipo, serie, numero, fecha_emision, fecha_vencimiento, estado, moneda, tipo_cambio, referencia_id,
         op_gravada, igv, total, retencion_monto, pen_gravada, pen_igv, pen_total, pen_retencion,
         clientes!comprobantes_cliente_id_fkey(razon_social, tipo_documento, numero_documento)`,
      )
      .gte("fecha_emision", desde)
      .lte("fecha_emision", hasta)
      .order("fecha_emision")
      .order("numero")
      .limit(5000),
    seriesDePrueba(),
  ]);
  if (error) throw new Error(error.message);

  // F001, FC01, T001…: las de prueba se quitan del registro y se cuentan.
  const { quedan: data, omitidos } = sinSeriesDePrueba(
    (todos ?? []).map((d) => ({ ...d, serie: String(d.serie) })),
    prueba,
  );

  // El comprobante al que apunta cada nota, en una consulta aparte: la
  // relación de `comprobantes` consigo misma PostgREST la resolvía en el
  // sentido contrario (las notas DE este) y la referencia salía vacía.
  const idsRef = [...new Set(data.map((d) => d.referencia_id).filter((x): x is string => !!x))];
  const refs = new Map<string, { tipo: string; numero: string; fecha_emision: string; tipo_cambio: number | null }>();
  if (idsRef.length > 0) {
    const r = await supabase.from("comprobantes").select("id, tipo, numero, fecha_emision, tipo_cambio").in("id", idsRef);
    if (r.error) throw new Error(r.error.message);
    for (const x of r.data ?? []) {
      refs.set(String(x.id), {
        tipo: String(x.tipo),
        numero: String(x.numero),
        fecha_emision: String(x.fecha_emision),
        tipo_cambio: x.tipo_cambio == null ? null : Number(x.tipo_cambio),
      });
    }
  }

  const filas = data.map((d) => {
    const cli = uno(d.clientes as Uno<{ razon_social: string; tipo_documento: string; numero_documento: string }>);
    const ref = d.referencia_id ? (refs.get(String(d.referencia_id)) ?? null) : null;
    const moneda = d.moneda === "PEN" ? "PEN" : "USD";
    // En dólares: el de la factura; si no lo tiene, el de su día — y una
    // nota, el de su comprobante, que es con el que se registra.
    const propio = Number(d.tipo_cambio) > 0 ? Number(d.tipo_cambio) : null;
    const tipoCambio =
      moneda === "PEN"
        ? propio
        : (propio ??
          (ref ? (Number(ref.tipo_cambio) > 0 ? Number(ref.tipo_cambio) : cambio(ref.fecha_emision)) : cambio(String(d.fecha_emision))));
    const c: ComprobanteContable = {
      tipo: d.tipo as ComprobanteContable["tipo"],
      numero: String(d.numero),
      fecha: String(d.fecha_emision),
      vence: d.fecha_vencimiento ? String(d.fecha_vencimiento) : null,
      estado: String(d.estado),
      moneda,
      tipoCambio,
      gravada: Number(d.op_gravada ?? 0),
      igv: Number(d.igv ?? 0),
      total: Number(d.total ?? 0),
      retencion: Number(d.retencion_monto ?? 0),
      penGravada: d.pen_gravada == null ? null : Number(d.pen_gravada),
      penIgv: d.pen_igv == null ? null : Number(d.pen_igv),
      penTotal: d.pen_total == null ? null : Number(d.pen_total),
      penRetencion: d.pen_retencion == null ? null : Number(d.pen_retencion),
      cliente: cli?.razon_social ?? "",
      clienteTipoDoc: cli?.tipo_documento ?? null,
      clienteDoc: cli?.numero_documento ?? null,
      referencia: ref
        ? { tipo: ref.tipo as ComprobanteContable["tipo"], numero: ref.numero, fecha: ref.fecha_emision }
        : null,
    };
    return filaRegistro(c);
  });
  return { filas, omitidos };
}

async function leerCompras(
  desde: string,
  hasta: string,
  cambio: (f: string) => number | null,
): Promise<{ filas: ReturnType<typeof filaCompra>[]; sinFactura: OrdenSinFactura[] }> {
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("compras")
    .select(
      `numero, fecha, tipo, estado, documento_proveedor, moneda, tipo_cambio, subtotal, igv, total,
       proveedores!compras_proveedor_id_fkey(razon_social, tipo_documento, numero_documento)`,
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    // Una orden sin comprar todavía no es una compra para el contador.
    .in("estado", ["registrada", "recibida_parcial", "recibida"])
    .order("fecha")
    .limit(5000);
  if (error) throw new Error(error.message);

  const compras: CompraContable[] = (data ?? []).map((d) => {
    const p = uno(d.proveedores as Uno<{ razon_social: string; tipo_documento: string; numero_documento: string }>);
    const moneda = d.moneda === "PEN" ? "PEN" : "USD";
    return {
      fecha: String(d.fecha),
      numero: String(d.numero),
      documento: (d.documento_proveedor as string | null)?.trim() || null,
      tipo: String(d.tipo),
      moneda,
      tipoCambio: moneda === "PEN" ? Number(d.tipo_cambio) || null : cambio(String(d.fecha)),
      base: Number(d.subtotal ?? 0),
      igv: Number(d.igv ?? 0),
      total: Number(d.total ?? 0),
      proveedor: p?.razon_social ?? "",
      proveedorTipoDoc: p?.tipo_documento ?? null,
      proveedorDoc: p?.numero_documento ?? null,
    };
  });
  // Al registro, solo lo que tiene factura del proveedor (157).
  const { registro, sinFactura } = separarCompras(compras);
  return { filas: registro.map(filaCompra), sinFactura };
}

export async function libroContador(mes: string, desde: string, hasta: string): Promise<Buffer> {
  const cambio = await cambiosDelRango(desde, hasta);
  const [{ filas: ventas, omitidos: ventasDePrueba }, { filas: compras, sinFactura }] = await Promise.all([
    leerVentas(desde, hasta, cambio),
    leerCompras(desde, hasta, cambio),
  ]);

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  const cabecera = (h: import("exceljs").Worksheet) => {
    const r = h.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    r.alignment = { vertical: "middle", wrapText: true };
    r.height = 32;
  };
  const totalFila = (h: import("exceljs").Worksheet, columnas: number[]) => {
    const n = h.rowCount;
    if (n < 2) return;
    const fila = h.addRow([]);
    fila.getCell(1).value = "TOTAL";
    for (const c of columnas) {
      const letra = h.getColumn(c).letter;
      fila.getCell(c).value = { formula: `SUM(${letra}2:${letra}${n})` };
    }
    fila.font = { bold: true };
  };

  // ------------------------------------------------------------------ Léeme --
  const t = totalesRegistro(ventas);
  const comprasSinCambio = compras.filter((c) => c.base == null).length;
  const leeme = wb.addWorksheet("Léeme");
  leeme.columns = [{ width: 44 }, { width: 22 }];
  const linea = (a: string, b?: string | number, formato?: string) => {
    const f = leeme.addRow([a, b ?? ""]);
    if (formato) f.getCell(2).numFmt = formato;
    return f;
  };
  linea(`Inversiones Rodatech · ${nombreMes(mes)}`).font = { bold: true, size: 14 };
  linea(`Del ${desde.split("-").reverse().join("/")} al ${hasta.split("-").reverse().join("/")}. Importes en soles.`);
  linea("");
  linea("VENTAS").font = { bold: true };
  linea("Documentos", t.documentos);
  linea("De ellos, anulados (van en cero)", t.anulados);
  linea("Base imponible", t.base, SOLES);
  linea("IGV", t.igv, SOLES);
  linea("Total", t.total, SOLES);
  linea("Retenciones que nos hicieron", t.retencion, SOLES);
  if (ventasDePrueba > 0) {
    linea(
      ventasDePrueba === 1
        ? "Se omitió 1 documento de una serie de prueba"
        : `Se omitieron ${ventasDePrueba} documentos de series de prueba`,
      ventasDePrueba,
    );
  }
  linea("");
  linea("COMPRAS").font = { bold: true };
  linea("Documentos", compras.length);
  linea("Base imponible", Math.round(compras.reduce((s, c) => s + (c.base ?? 0), 0) * 100) / 100, SOLES);
  linea("IGV", Math.round(compras.reduce((s, c) => s + (c.igv ?? 0), 0) * 100) / 100, SOLES);
  if (sinFactura.length > 0) {
    linea("Órdenes sin factura del proveedor (no van al registro: ver la hoja «Órdenes sin factura»)", sinFactura.length);
  }
  linea("");
  linea("CÓMO SE PASÓ A SOLES").font = { bold: true };
  for (const texto of [
    "Cada documento en dólares, con el tipo de cambio venta de SUNAT de su fecha de emisión.",
    "Domingos y feriados: el último publicado antes.",
    "Notas de crédito: con el cambio del comprobante que modifican, y en negativo.",
    "Facturas emitidas en soles: los importes impresos, sin convertir.",
    "Importaciones: con la factura del proveedor del exterior. El IGV de importación va en la DUA, que no está en el sistema.",
  ]) {
    linea(texto);
  }
  if (t.sinCambio || comprasSinCambio || sinFactura.length) {
    linea("");
    const aviso = linea("FALTA REVISAR");
    aviso.font = { bold: true, color: { argb: "FFB45309" } };
    if (t.sinCambio) linea("Ventas sin tipo de cambio (importes en blanco)", t.sinCambio);
    if (comprasSinCambio) linea("Compras sin tipo de cambio (importes en blanco)", comprasSinCambio);
    if (sinFactura.length) linea("Órdenes a las que les falta la factura del proveedor", sinFactura.length);
  }

  // ----------------------------------------------------------------- Ventas --
  const hv = wb.addWorksheet("Ventas", { views: [{ state: "frozen", ySplit: 1 }] });
  hv.columns = [
    { header: "Fecha de emisión", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Vencimiento", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Tipo (tabla 10)", width: 9 },
    { header: "Serie", width: 8 },
    { header: "Número", width: 11 },
    { header: "Tipo doc. cliente (tabla 2)", width: 11 },
    { header: "RUC / DNI", width: 14 },
    { header: "Cliente", width: 40 },
    { header: "Base imponible S/", width: 15, style: { numFmt: NUMERO } },
    { header: "IGV S/", width: 13, style: { numFmt: NUMERO } },
    { header: "Total S/", width: 15, style: { numFmt: NUMERO } },
    { header: "Moneda", width: 8 },
    { header: "Tipo de cambio", width: 9, style: { numFmt: "0.000" } },
    { header: "Total en su moneda", width: 14, style: { numFmt: NUMERO } },
    { header: "Retención S/", width: 12, style: { numFmt: NUMERO } },
    { header: "Ref. fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Ref. tipo", width: 8 },
    { header: "Ref. serie", width: 8 },
    { header: "Ref. número", width: 11 },
    { header: "Estado", width: 10 },
    { header: "Observación", width: 22 },
  ];
  cabecera(hv);
  for (const f of ventas) {
    hv.addRow([
      fechaExcel(f.fecha),
      f.vence ? fechaExcel(f.vence) : "",
      f.tipo,
      f.serie,
      f.numero,
      f.clienteTipoDoc,
      f.clienteDoc,
      f.cliente,
      f.base ?? "",
      f.igv ?? "",
      f.total ?? "",
      f.moneda,
      f.tipoCambio ?? "",
      f.totalOriginal,
      f.retencion || "",
      f.refFecha ? fechaExcel(f.refFecha) : "",
      f.refTipo,
      f.refSerie,
      f.refNumero,
      f.anulado ? "ANULADO" : "",
      f.falta ?? "",
    ]);
  }
  totalFila(hv, [9, 10, 11, 15]);
  if (hv.rowCount > 1) hv.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hv.columnCount } };

  // ---------------------------------------------------------------- Compras --
  const hc = wb.addWorksheet("Compras", { views: [{ state: "frozen", ySplit: 1 }] });
  hc.columns = [
    { header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Serie", width: 8 },
    { header: "Número", width: 12 },
    { header: "Tipo doc. proveedor (tabla 2)", width: 11 },
    { header: "RUC", width: 14 },
    { header: "Proveedor", width: 40 },
    { header: "Base imponible S/", width: 15, style: { numFmt: NUMERO } },
    { header: "IGV S/", width: 13, style: { numFmt: NUMERO } },
    { header: "Total S/", width: 15, style: { numFmt: NUMERO } },
    { header: "Moneda", width: 8 },
    { header: "Tipo de cambio", width: 9, style: { numFmt: "0.000" } },
    { header: "Total en su moneda", width: 14, style: { numFmt: NUMERO } },
    { header: "Local / importación", width: 12 },
    { header: "Nuestra compra", width: 15 },
    { header: "Observación", width: 30 },
  ];
  cabecera(hc);
  for (const f of compras) {
    hc.addRow([
      fechaExcel(f.fecha),
      f.serie,
      f.correlativo,
      f.proveedorTipoDoc,
      f.proveedorDoc,
      f.proveedor,
      f.base ?? "",
      f.igv ?? "",
      f.total ?? "",
      f.moneda,
      f.tipoCambio ?? "",
      f.totalOriginal,
      f.tipo,
      f.numero,
      f.falta ?? "",
    ]);
  }
  totalFila(hc, [7, 8, 9]);
  if (hc.rowCount > 1) hc.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hc.columnCount } };

  // ------------------------------------- Órdenes sin factura del proveedor --
  // Fuera del registro: sin el documento del proveedor no hay crédito fiscal
  // que sustentar. Aquí, para que Willy sepa qué factura le falta pedir. El
  // nombre de la hoja es corto porque Excel no admite más de 31 letras.
  if (sinFactura.length > 0) {
    const hs = wb.addWorksheet("Órdenes sin factura", { views: [{ state: "frozen", ySplit: 1 }] });
    hs.columns = [
      { header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Nuestra orden", width: 15 },
      { header: "Proveedor", width: 40 },
      { header: "Moneda", width: 8 },
      { header: "Total en su moneda", width: 14, style: { numFmt: NUMERO } },
    ];
    cabecera(hs);
    for (const o of sinFactura) {
      hs.addRow([fechaExcel(o.fecha), o.numero, o.proveedor, o.moneda, o.total]);
    }
  }

  const datos = await wb.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}
