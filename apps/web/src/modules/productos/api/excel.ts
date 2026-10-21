import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { ETIQUETA_STOCK, type EstadoStock } from "../dominio/tipos";

/**
 * El catálogo entero en Excel (21/10).
 *
 * Luis, 21/10: *«descargar en Excel todos los productos… que le dé la
 * información necesaria por familia, sub, activos o no, así completo y
 * ordenado bonito»*. Es la otra mitad de «Cargar desde Excel», que ya estaba.
 *
 * Dos hojas:
 *
 *  · **Productos** — uno por fila, ordenados por familia, subfamilia y
 *    código, con todo lo que tiene la ficha. Con autofiltro y totales hechos
 *    con SUBTOTAL, que siguen al filtro de Excel. Los dados de baja, en gris.
 *  · **Por familia** — cuántos hay en cada familia y subfamilia, cuántos con
 *    stock y cuántos sin precio, y lo que vale lo que hay en el almacén.
 *
 * Baja con los filtros de la lista (marca, familia, subfamilia, búsqueda y
 * «Mostrar»), así que «lo que veo es lo que bajo». Lee de
 * `v_productos_stock`, que es `security_invoker`: manda RLS.
 */

export interface FiltrosExcelProductos {
  q: string | null;
  marca: string | null;
  familia: string | null;
  subfamilia: string | null;
  /** Con los dados de baja. Sin esto, solo los activos. */
  archivados: boolean;
}

interface Fila {
  codigo: string;
  codigoFabricante: string;
  descripcion: string;
  marca: string;
  familia: string;
  subfamilia: string;
  tipo: string;
  unidad: string;
  stock: number;
  reservado: number;
  disponible: number;
  stockMinimo: number;
  estadoStock: string;
  costoPromedio: number;
  ultimoCosto: number;
  precioVenta: number;
  precioMinimo: number;
  margenPct: number | null;
  valorizado: number;
  ubicacion: string;
  pesoKg: number | null;
  proveedor: string;
  archivado: boolean;
}

/** Hasta mil filas por llamada: es el tope de PostgREST, y el catálogo pasa de 7.000. */
const PAGINA = 1000;

const SIN_FAMILIA = "(sin familia)";
const SIN_SUBFAMILIA = "(sin subfamilia)";

async function leerFilas(f: FiltrosExcelProductos): Promise<Fila[]> {
  const supabase = await clienteServidor();
  const salida: Fila[] = [];
  const n = (v: unknown) => Number(v ?? 0);
  const t = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabase
      .from("v_productos_stock")
      .select(
        `codigo, codigo_fabricante, descripcion, marca, familia, subfamilia, tipo, unidad,
         stock, reservado, disponible, stock_minimo, estado_stock,
         costo_promedio, ultimo_costo, precio_venta, precio_minimo, margen_pct, valorizado,
         ubicacion, peso_kg, proveedor, archivado`,
      )
      // El orden es el del libro, y además estable para paginar.
      .order("familia", { nullsFirst: false })
      .order("subfamilia", { nullsFirst: false })
      .order("codigo_norm")
      .range(desde, desde + PAGINA - 1);
    if (!f.archivados) consulta = consulta.eq("archivado", false);
    if (f.marca) consulta = consulta.eq("marca_id", f.marca);
    if (f.familia) consulta = consulta.eq("familia_id", f.familia);
    if (f.subfamilia) consulta = consulta.eq("subfamilia_id", f.subfamilia);
    if (f.q) {
      // La coma y los paréntesis son sintaxis de `or` en PostgREST: fuera.
      const q = f.q.replace(/[,()*%\\]/g, " ").trim();
      if (q) consulta = consulta.or(`codigo.ilike.%${q}%,codigo_fabricante.ilike.%${q}%,descripcion.ilike.%${q}%`);
    }

    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as Record<string, unknown>[];
    for (const r of filas) {
      salida.push({
        codigo: t(r.codigo),
        codigoFabricante: t(r.codigo_fabricante),
        descripcion: t(r.descripcion),
        marca: t(r.marca),
        familia: t(r.familia) || SIN_FAMILIA,
        subfamilia: t(r.subfamilia) || SIN_SUBFAMILIA,
        tipo: t(r.tipo),
        unidad: t(r.unidad),
        stock: n(r.stock),
        reservado: n(r.reservado),
        disponible: n(r.disponible),
        stockMinimo: n(r.stock_minimo),
        estadoStock: ETIQUETA_STOCK[r.estado_stock as EstadoStock] ?? t(r.estado_stock),
        costoPromedio: n(r.costo_promedio),
        ultimoCosto: n(r.ultimo_costo),
        precioVenta: n(r.precio_venta),
        precioMinimo: n(r.precio_minimo),
        margenPct: r.margen_pct === null || r.margen_pct === undefined ? null : n(r.margen_pct),
        valorizado: n(r.valorizado),
        ubicacion: t(r.ubicacion),
        pesoKg: r.peso_kg === null || r.peso_kg === undefined ? null : n(r.peso_kg),
        proveedor: t(r.proveedor),
        archivado: r.archivado === true,
      });
    }
    if (filas.length < PAGINA) break;
  }
  return salida;
}

const DINERO = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const CANTIDAD = "#,##0.##;[Red]-#,##0.##";
const ENTERO = "#,##0";
const AZUL = "FF0E4C73";
const AZUL_CLARO = "FFE3EEF6";
const GRIS = "FF66717F";
const BLANCO = "FFFFFFFF";

/** Un precio o un costo en cero es «no está», no «vale cero»: celda vacía. */
const oVacio = (v: number) => (v > 0 ? v : "");

export async function libroProductos(opciones: {
  filtros: FiltrosExcelProductos;
  /** Cómo se describen los filtros en la cabecera: «Familia Rodamientos · solo activos». */
  descripcionFiltros: string;
}): Promise<{ libro: Buffer; productos: number }> {
  const filas = await leerFilas(opciones.filtros);

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rodatech ERP";
  wb.created = new Date();

  const hoy = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long" }).format(new Date());

  // ------------------------------------------------------------- Productos --
  type Col = { titulo: string; ancho: number; valor: (f: Fila) => unknown; formato?: string; suma?: boolean };
  const columnas: Col[] = [
    { titulo: "Familia", ancho: 20, valor: (f) => f.familia },
    { titulo: "Subfamilia", ancho: 24, valor: (f) => f.subfamilia },
    { titulo: "Código", ancho: 20, valor: (f) => f.codigo },
    { titulo: "Código de fábrica", ancho: 18, valor: (f) => f.codigoFabricante },
    { titulo: "Descripción", ancho: 50, valor: (f) => f.descripcion },
    { titulo: "Marca", ancho: 14, valor: (f) => f.marca },
    { titulo: "Tipo", ancho: 14, valor: (f) => f.tipo },
    { titulo: "Unidad", ancho: 9, valor: (f) => f.unidad },
    { titulo: "Stock", ancho: 10, valor: (f) => f.stock, formato: CANTIDAD, suma: true },
    { titulo: "Reservado", ancho: 11, valor: (f) => f.reservado, formato: CANTIDAD, suma: true },
    { titulo: "Disponible", ancho: 11, valor: (f) => f.disponible, formato: CANTIDAD, suma: true },
    { titulo: "Stock mínimo", ancho: 11, valor: (f) => f.stockMinimo || "", formato: CANTIDAD },
    { titulo: "Situación del stock", ancho: 15, valor: (f) => f.estadoStock },
    { titulo: "Costo promedio", ancho: 14, valor: (f) => oVacio(f.costoPromedio), formato: DINERO },
    { titulo: "Último costo", ancho: 13, valor: (f) => oVacio(f.ultimoCosto), formato: DINERO },
    { titulo: "Precio de venta", ancho: 14, valor: (f) => oVacio(f.precioVenta), formato: DINERO },
    { titulo: "Precio mínimo de venta", ancho: 14, valor: (f) => oVacio(f.precioMinimo), formato: DINERO },
    // Sobre el COSTO, como en todo el ERP (023).
    { titulo: "Margen % sobre el costo", ancho: 13, valor: (f) => (f.margenPct === null ? "" : f.margenPct / 100), formato: "0.0%" },
    { titulo: "Valor en almacén (al costo)", ancho: 16, valor: (f) => f.valorizado, formato: DINERO, suma: true },
    { titulo: "Ubicación", ancho: 12, valor: (f) => f.ubicacion },
    { titulo: "Peso (kg)", ancho: 10, valor: (f) => (f.pesoKg && f.pesoKg > 0 ? f.pesoKg : ""), formato: "#,##0.###" },
    { titulo: "Proveedor habitual", ancho: 30, valor: (f) => f.proveedor },
    { titulo: "Estado", ancho: 10, valor: (f) => (f.archivado ? "De baja" : "Activo") },
  ];

  const FILA_TITULOS = 4;
  const hoja = wb.addWorksheet("Productos", {
    // Quietas las cabeceras y las tres primeras columnas: familia, subfamilia
    // y código siguen a la vista al moverse a la derecha.
    views: [{ state: "frozen", ySplit: FILA_TITULOS, xSplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));

  const activos = filas.filter((f) => !f.archivado).length;
  hoja.getCell("A1").value = "Catálogo de productos · Inversiones Rodatech";
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: AZUL } };
  hoja.getCell("A2").value =
    `${opciones.descripcionFiltros} · ${filas.length.toLocaleString("es-PE")} ${filas.length === 1 ? "producto" : "productos"}` +
    (filas.length !== activos ? ` (${activos.toLocaleString("es-PE")} activos)` : "") +
    ` · al ${hoy} · precios y costos sin IGV`;
  hoja.getCell("A2").font = { size: 12, color: { argb: GRIS } };

  const cabecera = hoja.getRow(FILA_TITULOS);
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: BLANCO } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { vertical: "middle", wrapText: true };
  });
  cabecera.height = 34;

  filas.forEach((f, i) => {
    const fila = hoja.getRow(FILA_TITULOS + 1 + i);
    columnas.forEach((c, j) => {
      const celda = fila.getCell(j + 1);
      celda.value = c.valor(f) as never;
      if (c.formato) celda.numFmt = c.formato;
    });
    // Los dados de baja se leen igual, pero se distinguen sin filtrar.
    if (f.archivado) fila.font = { italic: true, color: { argb: GRIS } };
  });

  const ultima = FILA_TITULOS + filas.length;
  if (filas.length > 0) {
    hoja.autoFilter = { from: { row: FILA_TITULOS, column: 1 }, to: { row: ultima, column: columnas.length } };
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
  } else {
    hoja.getCell(`A${FILA_TITULOS + 1}`).value = "Ningún producto con estos filtros.";
  }

  // ----------------------------------------------------------- Por familia --
  interface Grupo {
    productos: number;
    activos: number;
    deBaja: number;
    conStock: number;
    sinPrecio: number;
    sinCosto: number;
    unidades: number;
    valorizado: number;
  }
  const vacio = (): Grupo => ({
    productos: 0, activos: 0, deBaja: 0, conStock: 0, sinPrecio: 0, sinCosto: 0, unidades: 0, valorizado: 0,
  });
  const sumar = (g: Grupo, f: Fila) => {
    g.productos += 1;
    if (f.archivado) g.deBaja += 1;
    else g.activos += 1;
    if (f.stock > 0) g.conStock += 1;
    if (!(f.precioVenta > 0)) g.sinPrecio += 1;
    if (!(f.costoPromedio > 0)) g.sinCosto += 1;
    g.unidades += f.stock;
    g.valorizado += f.valorizado;
  };

  const familias = new Map<string, { total: Grupo; subs: Map<string, Grupo> }>();
  const general = vacio();
  for (const f of filas) {
    const fam = familias.get(f.familia) ?? { total: vacio(), subs: new Map<string, Grupo>() };
    const sub = fam.subs.get(f.subfamilia) ?? vacio();
    sumar(fam.total, f);
    sumar(sub, f);
    sumar(general, f);
    fam.subs.set(f.subfamilia, sub);
    familias.set(f.familia, fam);
  }

  const hojaFam = wb.addWorksheet("Por familia", { views: [{ state: "frozen", ySplit: 1 }] });
  hojaFam.columns = [
    { header: "Familia", width: 24 },
    { header: "Subfamilia", width: 28 },
    { header: "Productos", width: 11, style: { numFmt: ENTERO } },
    { header: "Activos", width: 10, style: { numFmt: ENTERO } },
    { header: "De baja", width: 10, style: { numFmt: ENTERO } },
    { header: "Con stock", width: 11, style: { numFmt: ENTERO } },
    { header: "Sin precio de venta", width: 13, style: { numFmt: ENTERO } },
    { header: "Sin costo", width: 11, style: { numFmt: ENTERO } },
    { header: "Unidades en stock", width: 13, style: { numFmt: CANTIDAD } },
    { header: "Valor en almacén (al costo)", width: 18, style: { numFmt: DINERO } },
  ];
  const r1 = hojaFam.getRow(1);
  r1.font = { bold: true, color: { argb: BLANCO } };
  r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  r1.alignment = { vertical: "middle", wrapText: true };
  r1.height = 34;

  const cifras = (g: Grupo) => [
    g.productos, g.activos, g.deBaja, g.conStock, g.sinPrecio, g.sinCosto, g.unidades, g.valorizado,
  ];
  // Las familias por cantidad de productos: lo grande del catálogo, arriba.
  const ordenadas = [...familias.entries()].sort((a, b) => b[1].total.productos - a[1].total.productos);
  for (const [nombre, fam] of ordenadas) {
    // La familia en una franja con su total, y sus subfamilias debajo.
    const filaFam = hojaFam.addRow([nombre, "Toda la familia", ...cifras(fam.total)]);
    filaFam.font = { bold: true };
    filaFam.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } };
    const subs = [...fam.subs.entries()].sort((a, b) => b[1].productos - a[1].productos);
    for (const [sub, g] of subs) hojaFam.addRow(["", sub, ...cifras(g)]);
  }
  const filaTotal = hojaFam.addRow(["Todo el catálogo", "", ...cifras(general)]);
  filaTotal.font = { bold: true, color: { argb: BLANCO } };
  filaTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };

  const datos = await wb.xlsx.writeBuffer();
  return { libro: Buffer.from(datos as ArrayBuffer), productos: filas.length };
}
