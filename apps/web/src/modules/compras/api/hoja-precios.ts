import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { unidadLegible } from "@/modules/cotizaciones/dominio/unidades";

import { calcular } from "../dominio/analisis";
import { clave, hojaVacia, type Casilla, type Hoja, type ProductoHoja, type ProveedorHoja } from "../dominio/hoja-precios";
import { analisisPorId } from "./analisis";
import { rondaDetalle, type EstadoRonda, type RondaDetalle } from "./comparador";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const positivo = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface Referencias {
  precioVenta: number | null;
  ultimoCosto: number | null;
  ultimaCompra: ProductoHoja["ultimaCompra"];
  ultimaVenta: ProductoHoja["ultimaVenta"];
}

/**
 * Contra qué se mide cada precio que se apunta (07/10).
 *
 * Luis: *«cuánto le vendieron la última vez y ahora, aparte cuánto va a ganar
 * por cada venta con ese precio»*. Así que además del P.V. del catálogo, la
 * ÚLTIMA COMPRA de verdad (con proveedor y fecha) y la ÚLTIMA VENTA (con
 * cliente y fecha). Tres lecturas para todos los productos de la hoja, no tres
 * por producto.
 */
export async function referenciasDeProductos(ids: readonly string[]): Promise<Map<string, Referencias>> {
  if (ids.length === 0) return new Map();
  const unicos = [...new Set(ids)];
  const supabase = await clienteServidor();
  const [{ data: maestro }, { data: compras }, { data: ventas }] = await Promise.all([
    supabase.from("productos").select("id, precio_venta, ultimo_costo, costo_promedio").in("id", unicos),
    supabase
      .from("compra_items")
      .select("producto_id, costo_unitario, compras!inner(fecha, moneda, tipo_cambio, estado, proveedores(razon_social))")
      .in("producto_id", unicos)
      .neq("compras.estado", "anulada")
      .limit(1000),
    supabase
      .from("comprobante_items")
      .select("producto_id, valor_unitario, comprobantes!inner(fecha_emision, estado, tipo, clientes(razon_social))")
      .in("producto_id", unicos)
      .neq("comprobantes.estado", "anulado")
      .eq("comprobantes.tipo", "factura")
      .limit(1000),
  ]);

  const ultimaCompra = new Map<string, NonNullable<ProductoHoja["ultimaCompra"]>>();
  for (const c of (compras ?? []) as unknown as {
    producto_id: string;
    costo_unitario: number;
    compras: { fecha: string; moneda: string; tipo_cambio: number | null; proveedores: { razon_social: string } | null };
  }[]) {
    const tc = Number(c.compras.tipo_cambio) || 0;
    const costo = c.compras.moneda === "PEN" ? (tc > 0 ? Number(c.costo_unitario) / tc : null) : Number(c.costo_unitario);
    if (costo === null || !(costo > 0)) continue;
    const ya = ultimaCompra.get(c.producto_id);
    if (!ya || c.compras.fecha > ya.fecha) {
      ultimaCompra.set(c.producto_id, {
        costoUsd: Math.round(costo * 100) / 100,
        fecha: c.compras.fecha,
        proveedor: c.compras.proveedores?.razon_social ?? "—",
      });
    }
  }

  const ultimaVenta = new Map<string, NonNullable<ProductoHoja["ultimaVenta"]>>();
  for (const v of (ventas ?? []) as unknown as {
    producto_id: string;
    valor_unitario: number;
    comprobantes: { fecha_emision: string; clientes: { razon_social: string } | null };
  }[]) {
    const precio = Number(v.valor_unitario);
    if (!(precio > 0)) continue;
    const ya = ultimaVenta.get(v.producto_id);
    if (!ya || v.comprobantes.fecha_emision > ya.fecha) {
      ultimaVenta.set(v.producto_id, {
        precio: Math.round(precio * 100) / 100,
        fecha: v.comprobantes.fecha_emision,
        cliente: v.comprobantes.clientes?.razon_social ?? "—",
      });
    }
  }

  return new Map(
    (maestro ?? []).map((p) => [
      String(p.id),
      {
        precioVenta: positivo(p.precio_venta),
        ultimoCosto: positivo(p.ultimo_costo) ?? positivo(p.costo_promedio),
        ultimaCompra: ultimaCompra.get(String(p.id)) ?? null,
        ultimaVenta: ultimaVenta.get(String(p.id)) ?? null,
      },
    ]),
  );
}

export interface ProductoReciente {
  id: string;
  codigo: string;
  descripcion: string;
  marca: string | null;
  unidad: string;
  stock: number;
  estado_stock: "sin_stock" | "bajo" | "ok";
  costo_promedio: number;
  ultimo_costo: number;
  codigo_fabricante: string | null;
  /** Cuándo se compró o se preguntó por última vez. */
  cuando: string;
}

/**
 * Lo último que se compró —y, si hay pocos, lo último que se preguntó—, para
 * enseñarlo al tocar el buscador sin haber escrito nada (07/10).
 *
 * Luis: *«cuando doy clic en el input de añadir producto, que me aparezcan
 * los cinco, seis últimos productos comprados»*.
 */
export async function productosRecientes(limite = 6): Promise<ProductoReciente[]> {
  const supabase = await clienteServidor();
  const [{ data: comprados }, { data: preguntados }] = await Promise.all([
    supabase
      .from("compra_items")
      .select("producto_id, compras!inner(fecha, estado, creado_en)")
      .neq("compras.estado", "anulada")
      .order("creado_en", { ascending: false, referencedTable: "compras" })
      .limit(200),
    supabase
      .from("consulta_precio_items")
      .select("producto_id, consultas_precio!inner(fecha, creado_en)")
      .limit(200),
  ]);

  const orden: { id: string; cuando: string }[] = [];
  const visto = new Set<string>();
  const filas = [
    ...((comprados ?? []) as unknown as { producto_id: string; compras: { fecha: string; creado_en: string } }[]).map((c) => ({
      id: c.producto_id,
      cuando: c.compras.creado_en ?? c.compras.fecha,
    })),
    ...((preguntados ?? []) as unknown as { producto_id: string; consultas_precio: { fecha: string; creado_en: string } }[]).map(
      (c) => ({ id: c.producto_id, cuando: c.consultas_precio.creado_en ?? c.consultas_precio.fecha }),
    ),
  ].sort((x, y) => (x.cuando < y.cuando ? 1 : -1));
  for (const f of filas) {
    if (visto.has(f.id)) continue;
    visto.add(f.id);
    orden.push(f);
    if (orden.length >= limite) break;
  }
  if (orden.length === 0) return [];

  const { data } = await supabase
    .from("productos")
    .select("id, codigo, codigo_fabricante, descripcion, unidad_codigo, stock_minimo, costo_promedio, ultimo_costo, marcas(nombre), stock(cantidad)")
    .in(
      "id",
      orden.map((o) => o.id),
    );
  const porId = new Map(((data ?? []) as unknown as Record<string, unknown>[]).map((p) => [String(p.id), p]));
  return orden
    .map((o) => {
      const p = porId.get(o.id);
      if (!p) return null;
      const filaStock = p.stock as { cantidad: number } | { cantidad: number }[] | null;
      const stock = Number((Array.isArray(filaStock) ? filaStock[0]?.cantidad : filaStock?.cantidad) ?? 0);
      const minimo = Number(p.stock_minimo ?? 0);
      return {
        id: o.id,
        codigo: String(p.codigo),
        codigo_fabricante: (p.codigo_fabricante as string | null) ?? null,
        descripcion: String(p.descripcion ?? ""),
        marca: (p.marcas as { nombre: string } | null)?.nombre ?? null,
        unidad: String(p.unidad_codigo ?? "NIU"),
        stock,
        estado_stock: stock <= 0 ? "sin_stock" : minimo > 0 && stock <= minimo ? "bajo" : "ok",
        costo_promedio: Number(p.costo_promedio ?? 0),
        ultimo_costo: Number(p.ultimo_costo ?? 0),
        cuando: o.cuando,
      } as ProductoReciente;
    })
    .filter((x): x is ProductoReciente => x !== null);
}

export interface HistorialProducto {
  /** Lo que contestó cada proveedor en las consultas, se le comprara o no. */
  cotizado: { fecha: string; consulta: string; proveedor: string; costoUsd: number | null; noTiene: boolean }[];
  comprado: { fecha: string; numero: string; proveedor: string; cantidad: number; costoUsd: number }[];
  vendido: { fecha: string; documento: string; cliente: string; cantidad: number; precio: number }[];
}

/**
 * Todo lo que se sabe del precio de un producto, con fecha (07/10).
 *
 * Luis: *«si yo registré en pedir precios dos productos con dos proveedores,
 * sé que le compré a uno, pero igual tiene que guardarse el precio del otro
 * para ya no pedirle precio después, porque ya sé cuál es su precio»*. Se
 * guardaba desde la 055 —cada casilla es una respuesta— y no se enseñaba en
 * ningún sitio de la hoja.
 */
export async function historialDeProducto(productoId: string): Promise<Resultado<HistorialProducto>> {
  try {
    const supabase = await clienteServidor();
    const [cot, comp, vent] = await Promise.all([
      supabase
        .from("v_comparativa_precios")
        .select("fecha, consulta, proveedor, costo_usd, disponible")
        .eq("producto_id", productoId)
        .or("costo_usd.not.is.null,disponible.eq.false")
        .order("fecha", { ascending: false })
        .limit(30),
      supabase
        .from("compra_items")
        .select("cantidad, costo_unitario, compras!inner(numero, fecha, moneda, tipo_cambio, estado, proveedores(razon_social))")
        .eq("producto_id", productoId)
        .neq("compras.estado", "anulada")
        .limit(100),
      supabase.rpc("historial_precio_producto", { p_producto: productoId, p_limit: 15 }),
    ]);
    if (cot.error) return { ok: false, error: cot.error.message };
    if (comp.error) return { ok: false, error: comp.error.message };
    if (vent.error) return { ok: false, error: vent.error.message };

    const comprado = ((comp.data ?? []) as unknown as {
      cantidad: number;
      costo_unitario: number;
      compras: { numero: string; fecha: string; moneda: string; tipo_cambio: number | null; proveedores: { razon_social: string } | null };
    }[])
      .map((c) => {
        const tc = Number(c.compras.tipo_cambio) || 0;
        const usd = c.compras.moneda === "PEN" ? (tc > 0 ? Number(c.costo_unitario) / tc : 0) : Number(c.costo_unitario);
        return {
          fecha: c.compras.fecha,
          numero: c.compras.numero,
          proveedor: c.compras.proveedores?.razon_social ?? "—",
          cantidad: Number(c.cantidad),
          costoUsd: Math.round(usd * 100) / 100,
        };
      })
      .sort((x, y) => (x.fecha < y.fecha ? 1 : -1))
      .slice(0, 15);

    return {
      ok: true,
      datos: {
        cotizado: (cot.data ?? []).map((f) => ({
          fecha: String(f.fecha),
          consulta: String(f.consulta),
          proveedor: String(f.proveedor),
          costoUsd: f.costo_usd === null ? null : Number(f.costo_usd),
          noTiene: f.disponible === false,
        })),
        comprado,
        vendido: ((vent.data ?? []) as { fecha: string; documento: string; cliente: string; cantidad: number; valor_unitario: number }[]).map(
          (v) => ({
            fecha: String(v.fecha),
            documento: String(v.documento),
            cliente: String(v.cliente),
            cantidad: Number(v.cantidad),
            precio: Number(v.valor_unitario),
          }),
        ),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el historial." };
  }
}

export interface HojaCargada {
  hoja: Hoja;
  estado: EstadoRonda;
  fecha: string;
  compras: RondaDetalle["compras"];
}

/** Una consulta guardada, como hoja. */
export async function hojaDeConsulta(id: string): Promise<Resultado<HojaCargada>> {
  const r = await rondaDetalle(id);
  if (!r.ok) return r;
  const d = r.datos;
  const refs = await referenciasDeProductos(d.items.map((i) => i.producto_id));

  const productos: ProductoHoja[] = d.items.map((i) => ({
    productoId: i.producto_id,
    codigo: i.codigo,
    descripcion: i.descripcion,
    marca: i.marca,
    unidad: unidadLegible(i.unidad),
    cantidad: Number(i.cantidad) || 1,
    precioVenta: refs.get(i.producto_id)?.precioVenta ?? null,
    ultimoCosto: refs.get(i.producto_id)?.ultimoCosto ?? null,
    ultimaCompra: refs.get(i.producto_id)?.ultimaCompra ?? null,
    ultimaVenta: refs.get(i.producto_id)?.ultimaVenta ?? null,
  }));

  const proveedores: ProveedorHoja[] = d.proveedores.map((p) => ({
    proveedorId: p.proveedor_id,
    nombre: p.proveedor,
    tipo: p.tipoProveedor,
    moneda: p.moneda,
    tipoCambio: p.tipo_cambio,
    incluyeIgv: p.incluye_igv,
  }));

  const itemAProducto = new Map(d.items.map((i) => [i.item_id, i.producto_id]));
  const cpAProveedor = new Map(d.proveedores.map((p) => [p.consulta_proveedor_id, p.proveedor_id]));
  const casillas: Record<string, Casilla> = {};
  for (const resp of d.respuestas) {
    const prod = itemAProducto.get(resp.item_id);
    const prov = cpAProveedor.get(resp.consulta_proveedor_id);
    if (!prod || !prov) continue;
    if (!resp.disponible) casillas[clave(prov, prod)] = { precio: null, noTiene: true, tiene: null };
    else if (resp.costo_unitario !== null) {
      casillas[clave(prov, prod)] = {
        precio: resp.costo_unitario,
        noTiene: false,
        tiene: resp.cantidad_disponible ?? null,
      };
    }
  }

  return {
    ok: true,
    datos: {
      hoja: { ...hojaVacia(), consultaId: d.id, numero: d.numero, nota: d.nota ?? "", productos, proveedores, casillas },
      estado: d.estado,
      fecha: d.fecha,
      compras: d.compras,
    },
  };
}

export interface AnalisisParaHoja {
  numero: string;
  proveedor: ProveedorHoja | null;
  productos: ProductoHoja[];
  /** PU LIMA de cada producto, en dólares: lo que cuesta puesto en Lima. */
  precios: Record<string, number>;
  /** Códigos que no están en el catálogo: no se pueden pedir hasta darlos de alta. */
  sinCatalogo: string[];
}

/**
 * Un análisis de importación, listo para la hoja (07/10).
 *
 * Luis: *«también tiene que estar unida al análisis de importación, si quiere
 * jalar productos con precios de ahí, porque en ese análisis ya sabe lo que
 * quiere comprar»*.
 *
 * Se trae la CANT. PEDIDO y, como precio del proveedor, el **PU LIMA** —FOB más
 * su parte de envío y desaduanaje—, no el FOB: comparado contra un proveedor de
 * Lima, el FOB haría ganar siempre a la importación sin contar lo que cuesta
 * traerla. Sin precio de venta en el catálogo, el margen se mide contra su P.M.
 */
export async function analisisParaHoja(id: string): Promise<Resultado<AnalisisParaHoja | null>> {
  const r = await analisisPorId(id);
  if (!r.ok) return r;
  const a = r.datos;
  if (!a) return { ok: true, datos: null };

  const calculo = calcular({
    costoEnvio: a.costo_envio,
    pesoDeclarado: a.peso_declarado ?? 0,
    desaduanajeSoles: a.desaduanaje_soles,
    tipoCambio: a.tipo_cambio ?? 0,
    lineas: a.items.map((i, k) => ({
      key: String(k),
      productoId: i.producto_id,
      codigo: i.codigo,
      marca: i.marca ?? "",
      descripcion: i.descripcion ?? "",
      cliente: i.cliente ?? "",
      proveedorMercado: i.proveedor_mercado ?? "",
      frecuencia: i.frecuencia,
      cantidadRef: i.cantidad_ref,
      cantidadPedido: i.cantidad_pedido,
      precioFob: i.precio_fob,
      pesoKg: i.peso_kg,
      precioMercado: i.precio_mercado,
    })),
  });

  const conProducto = a.items
    .map((i, k) => ({ i, k }))
    .filter(({ i }) => i.producto_id && i.cantidad_pedido > 0);
  const ids = conProducto.map(({ i }) => i.producto_id as string);

  const supabase = await clienteServidor();
  const [refs, { data: maestro }, { data: prov }] = await Promise.all([
    referenciasDeProductos(ids),
    ids.length
      ? supabase.from("productos").select("id, codigo, descripcion, unidad_codigo, marcas(nombre)").in("id", ids)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("proveedores").select("id, razon_social, tipo").eq("id", a.proveedor_id).maybeSingle(),
  ]);
  const porId = new Map(
    ((maestro ?? []) as { id: string; codigo: string; descripcion: string; unidad_codigo: string | null; marcas: { nombre: string } | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const productos: ProductoHoja[] = [];
  const precios: Record<string, number> = {};
  for (const { i, k } of conProducto) {
    const id = i.producto_id as string;
    const m = porId.get(id);
    const ref = refs.get(id);
    productos.push({
      productoId: id,
      codigo: m?.codigo ?? i.codigo,
      descripcion: m?.descripcion ?? i.descripcion ?? "",
      marca: m?.marcas?.nombre ?? i.marca,
      unidad: unidadLegible(m?.unidad_codigo ?? "NIU"),
      cantidad: Math.max(1, Math.round(i.cantidad_pedido)),
      precioVenta: ref?.precioVenta ?? positivo(i.precio_mercado),
      ultimoCosto: ref?.ultimoCosto ?? null,
      ultimaCompra: ref?.ultimaCompra ?? null,
      ultimaVenta: ref?.ultimaVenta ?? null,
      origen: a.numero,
    });
    const pu = calculo.lineas[String(k)]?.puLima;
    if (pu && pu > 0) precios[id] = Math.round(pu * 100) / 100;
  }

  const p = prov as { id: string; razon_social: string; tipo: string | null } | null;
  return {
    ok: true,
    datos: {
      numero: a.numero,
      proveedor: p
        ? {
            proveedorId: p.id,
            nombre: p.razon_social,
            tipo: p.tipo === "local" ? "local" : "importacion",
            moneda: "USD",
            tipoCambio: null,
            incluyeIgv: false,
          }
        : null,
      productos,
      precios,
      sinCatalogo: a.items.filter((i) => !i.producto_id).map((i) => i.codigo),
    },
  };
}

/** Los análisis que se pueden traer: los más recientes primero. */
export async function analisisParaElegir(): Promise<
  Resultado<{ id: string; numero: string; fecha: string; proveedor: string; productos: number; estado: string }[]>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("analisis_importacion")
      .select("id, numero, fecha, estado, proveedores(razon_social), analisis_importacion_items(count)")
      .order("creado_en", { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      datos: ((data ?? []) as unknown as {
        id: string;
        numero: string;
        fecha: string;
        estado: string;
        proveedores: { razon_social: string } | null;
        analisis_importacion_items: { count: number }[];
      }[]).map((f) => ({
        id: f.id,
        numero: f.numero,
        fecha: f.fecha,
        estado: f.estado,
        proveedor: f.proveedores?.razon_social ?? "—",
        productos: f.analisis_importacion_items?.[0]?.count ?? 0,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudieron leer los análisis." };
  }
}
