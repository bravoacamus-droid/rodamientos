import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  Evento,
  EventoTrazabilidad,
  Lado,
  Referencia,
  ResumenTrazabilidad,
} from "../dominio/tipos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * La línea de tiempo de un producto.
 *
 * Sin paginar y con tope alto: la historia de UN código son decenas de
 * documentos, no miles, y el sentido de la pantalla es verla entera. Si algún
 * día un rodamiento de rotación diaria pasa de 500 eventos, el tope avisa
 * —se ve que la lista se corta— antes que un `range()` que lo escondería.
 */
export async function lineaDeTiempo(
  productoId: string,
): Promise<Resultado<EventoTrazabilidad[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_trazabilidad_item")
      .select(
        `producto_id, fecha, dia, lado, evento, documento_id, documento,
         contraparte_id, contraparte, contraparte_doc, cantidad, unitario,
         importe, estado, referencia, secuencia`,
      )
      .eq("producto_id", productoId)
      // Se pide ordenado también aquí, aunque el dominio lo reordene: así el
      // recorte de 500 se queda con lo más reciente y no con lo primero que
      // devuelva el plan de ejecución.
      .order("dia", { ascending: false })
      .order("secuencia", { ascending: true })
      .limit(500);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((e) => ({
        producto_id: String(e.producto_id),
        fecha: String(e.fecha),
        dia: String(e.dia),
        lado: String(e.lado) as Lado,
        evento: String(e.evento) as Evento,
        documento_id: String(e.documento_id),
        documento: String(e.documento),
        contraparte_id: (e.contraparte_id as string | null) ?? null,
        contraparte: (e.contraparte as string | null) ?? null,
        contraparte_doc: (e.contraparte_doc as string | null) ?? null,
        cantidad: Number(e.cantidad ?? 0),
        unitario: Number(e.unitario ?? 0),
        importe: Number(e.importe ?? 0),
        estado: String(e.estado ?? ""),
        referencia: (e.referencia as string | null) ?? null,
        secuencia: Number(e.secuencia ?? 0),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Una referencia del JSON de `resumen_trazabilidad`, o null. */
function aReferencia(v: unknown): Referencia | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    id: (o.id as string | null) ?? null,
    nombre: (o.nombre as string | null) ?? null,
    unitario: Number(o.unitario ?? 0),
    fecha: String(o.fecha ?? ""),
    documento: String(o.documento ?? ""),
    estado: typeof o.estado === "string" ? o.estado : undefined,
  };
}

/**
 * La cabecera: mejor proveedor, última compra, última cotización y el rango de
 * precios cotizados.
 *
 * Lo calcula la base y no esta función, aunque la línea de tiempo ya venga
 * entera: el resumen tiene que salir aunque el recorte de 500 haya cortado
 * historia, y «el proveedor más barato de siempre» no puede depender de
 * cuántos eventos quepan en la pantalla.
 */
export async function resumen(
  productoId: string,
): Promise<Resultado<ResumenTrazabilidad>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("resumen_trazabilidad", {
      p_producto: productoId,
    });

    if (error) return fallo(error);

    const r = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      datos: {
        eventos: Number(r.eventos ?? 0),
        mejorProveedor: aReferencia(r.mejor_proveedor),
        ultimaCompra: aReferencia(r.ultima_compra),
        proveedores: Number(r.proveedores ?? 0),
        ultimaCotizacion: aReferencia(r.ultima_cotizacion),
        ultimaVenta: aReferencia(r.ultima_venta),
        clientes: Number(r.clientes ?? 0),
        unidadesVendidas: Number(r.unidades_vendidas ?? 0),
        cotizadoMin: r.cotizado_min === null || r.cotizado_min === undefined
          ? null
          : Number(r.cotizado_min),
        cotizadoMax: r.cotizado_max === null || r.cotizado_max === undefined
          ? null
          : Number(r.cotizado_max),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Lo mínimo del producto para encabezar la pantalla. */
export async function cabeceraProducto(id: string): Promise<
  Resultado<{
    id: string;
    codigo: string;
    descripcion: string;
    marca: string;
    stock: number;
    costo_promedio: number;
    precio_venta: number;
    precio_minimo: number;
  }>
> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select(
        `id, codigo, descripcion, costo_promedio, precio_venta, precio_minimo,
         marcas!inner(nombre), stock(cantidad)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: false, error: "El producto no existe." };

    const p = data as unknown as {
      id: string;
      codigo: string;
      descripcion: string;
      costo_promedio: number;
      precio_venta: number;
      precio_minimo: number;
      marcas: { nombre: string };
      stock: { cantidad: number } | null;
    };

    return {
      ok: true,
      datos: {
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        marca: p.marcas.nombre,
        stock: Number(p.stock?.cantidad ?? 0),
        costo_promedio: Number(p.costo_promedio ?? 0),
        precio_venta: Number(p.precio_venta ?? 0),
        precio_minimo: Number(p.precio_minimo ?? 0),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}
