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

/** El precio de venta y el último costo, que es contra lo que se mide cada precio. */
export async function referenciasDeProductos(
  ids: readonly string[],
): Promise<Map<string, { precioVenta: number | null; ultimoCosto: number | null }>> {
  if (ids.length === 0) return new Map();
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("productos")
    .select("id, precio_venta, ultimo_costo, costo_promedio")
    .in("id", [...new Set(ids)]);
  return new Map(
    (data ?? []).map((p) => [
      String(p.id),
      {
        precioVenta: positivo(p.precio_venta),
        ultimoCosto: positivo(p.ultimo_costo) ?? positivo(p.costo_promedio),
      },
    ]),
  );
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
      ? supabase.from("productos").select("id, codigo, descripcion, unidad, marcas(nombre)").in("id", ids)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("proveedores").select("id, razon_social, tipo").eq("id", a.proveedor_id).maybeSingle(),
  ]);
  const porId = new Map(
    ((maestro ?? []) as { id: string; codigo: string; descripcion: string; unidad: string | null; marcas: { nombre: string } | null }[]).map(
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
      unidad: unidadLegible(m?.unidad ?? "NIU"),
      cantidad: Math.max(1, Math.round(i.cantidad_pedido)),
      precioVenta: ref?.precioVenta ?? positivo(i.precio_mercado),
      ultimoCosto: ref?.ultimoCosto ?? null,
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
