import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import type {
  CompraDetalle,
  CompraLista,
  EstadoCompra,
  FiltrosCompras,
  LineaCompra,
  ProveedorOpcion,
  TipoCompra,
} from "../dominio/tipos";

export const POR_PAGINA = 30;

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/** Lo que PostgREST devuelve al anidar un producto con su marca. */
interface ProductoAnidado {
  codigo: string;
  descripcion: string;
  unidad_codigo: string;
  marcas: { nombre: string } | null;
}

interface ItemCrudo {
  id?: string;
  producto_id: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
  unidad_codigo: string;
  importe: number | null;
  productos: ProductoAnidado | null;
}

/** Redondeo a dos decimales para sumas de dinero. */
const dos = (n: number) => Math.round(n * 100) / 100;

/** Los valores que de verdad acepta cada enum de Postgres. */
const ESTADOS = ["registrada", "recibida_parcial", "recibida", "anulada"] as const;
const TIPOS = ["local", "importacion"] as const;

/**
 * Qué porcentaje de lo pedido ya llegó.
 *
 * Sobre CANTIDADES, no sobre líneas: recibir 9 de 10 referencias pero faltando
 * la que trae 500 unidades no es «90 % recibido».
 */
function avanceDe(items: readonly { cantidad: number; cantidad_recibida: number }[]): number {
  const pedido = items.reduce((a, i) => a + Number(i.cantidad ?? 0), 0);
  if (pedido <= 0) return 0;
  const recibido = items.reduce((a, i) => a + Number(i.cantidad_recibida ?? 0), 0);
  return Math.min(100, Math.round((recibido / pedido) * 100));
}

/**
 * Listado de compras.
 *
 * Keyset sobre `numero` descendente, igual que recepciones: el número es
 * `CMP-26-00001`, con año de dos cifras y relleno de ceros, así que ordena bien
 * como texto y no hace falta un índice aparte ni un OFFSET que se degrada. Se
 * pide un elemento de más para saber si hay página siguiente sin pagar un
 * `count` sobre toda la tabla.
 */
export async function listarCompras(
  filtros: FiltrosCompras,
): Promise<Resultado<{ filas: CompraLista[]; siguiente: string | null }>> {
  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from("compras")
      .select(
        `id, numero, fecha, fecha_estimada, tipo, documento_proveedor, estado,
         total, gastos_importacion,
         proveedores(razon_social),
         compra_items(cantidad, cantidad_recibida)`,
      )
      .order("numero", { ascending: false })
      .limit(POR_PAGINA + 1);

    if (filtros.cursor) consulta = consulta.lt("numero", filtros.cursor);
    if (filtros.proveedor) consulta = consulta.eq("proveedor_id", filtros.proveedor);
    // Estado y tipo llegan de la URL, o sea de fuera. Se contrastan contra la
    // lista real antes de tocar la consulta: un valor inventado haría fallar
    // el enum de Postgres, y el mensaje que vería el operador sería un error
    // de tipos, no «ese filtro no existe».
    const estado = ESTADOS.find((e) => e === filtros.estado);
    if (estado) consulta = consulta.eq("estado", estado);
    const tipo = TIPOS.find((t) => t === filtros.tipo);
    if (tipo) consulta = consulta.eq("tipo", tipo);
    if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
    if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
    if (filtros.q) {
      // Por lo que se busca una compra concreta: su número, o el de la factura
      // del proveedor que se tiene delante en papel.
      consulta = consulta.or(
        `numero.ilike.%${filtros.q}%,documento_proveedor.ilike.%${filtros.q}%,tracking.ilike.%${filtros.q}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        proveedores: { razon_social: string } | null;
        compra_items: { cantidad: number; cantidad_recibida: number }[] | null;
      }
    >;

    const todas: CompraLista[] = crudas.map((c) => {
      const items = c.compra_items ?? [];
      return {
        id: String(c.id),
        numero: String(c.numero),
        fecha: String(c.fecha),
        fecha_estimada: (c.fecha_estimada as string | null) ?? null,
        proveedor: c.proveedores?.razon_social ?? null,
        tipo: (c.tipo as TipoCompra) ?? "local",
        documento_proveedor: (c.documento_proveedor as string | null) ?? null,
        estado: c.estado as EstadoCompra,
        total: Number(c.total ?? 0),
        gastos_importacion: Number(c.gastos_importacion ?? 0),
        items: items.length,
        avance: avanceDe(items),
      };
    });

    const hayMas = todas.length > POR_PAGINA;
    const filas = hayMas ? todas.slice(0, POR_PAGINA) : todas;

    return {
      ok: true,
      datos: {
        filas,
        siguiente: hayMas ? (filas[filas.length - 1]?.numero ?? null) : null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** La ficha de una compra, con sus líneas y las recepciones que la consumieron. */
export async function detalleCompra(
  id: string,
): Promise<Resultado<CompraDetalle | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("compras")
      .select(
        `id, numero, fecha, fecha_estimada, proveedor_id, tipo,
         documento_proveedor, guia_proveedor, tracking, courier, estado,
         subtotal, igv, total, gastos_importacion, observaciones,
         motivo_anulacion, creado_en,
         proveedores(razon_social, numero_documento),
         perfiles(nombre),
         compra_items(
           id, producto_id, cantidad, cantidad_recibida, costo_unitario,
           unidad_codigo, importe,
           productos(codigo, descripcion, unidad_codigo, marcas(nombre))
         ),
         recepciones(id, numero, fecha)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fallo(error);
    if (!data) return { ok: true, datos: null };

    const c = data as unknown as Record<string, unknown> & {
      proveedores: { razon_social: string; numero_documento: string | null } | null;
      perfiles: { nombre: string } | null;
      compra_items: ItemCrudo[] | null;
      recepciones: { id: string; numero: string; fecha: string }[] | null;
    };

    const lineas: LineaCompra[] = (c.compra_items ?? []).map((i) => ({
      id: String(i.id ?? i.producto_id),
      producto_id: i.producto_id,
      codigo: i.productos?.codigo ?? "—",
      marca: i.productos?.marcas?.nombre ?? null,
      descripcion: i.productos?.descripcion ?? "—",
      unidad: i.unidad_codigo ?? i.productos?.unidad_codigo ?? "NIU",
      cantidad: Number(i.cantidad ?? 0),
      cantidad_recibida: Number(i.cantidad_recibida ?? 0),
      costo_unitario: Number(i.costo_unitario ?? 0),
      // `importe` es una columna generada: se usa la de la base, no se
      // recalcula. Recalcularla aquí sería abrir la puerta a que la ficha y la
      // base digan cosas distintas.
      importe: dos(Number(i.importe ?? 0)),
    }));

    return {
      ok: true,
      datos: {
        id: String(c.id),
        numero: String(c.numero),
        fecha: String(c.fecha),
        fecha_estimada: (c.fecha_estimada as string | null) ?? null,
        proveedor_id: String(c.proveedor_id),
        proveedor: c.proveedores?.razon_social ?? null,
        proveedor_documento: c.proveedores?.numero_documento ?? null,
        tipo: (c.tipo as TipoCompra) ?? "local",
        documento_proveedor: (c.documento_proveedor as string | null) ?? null,
        guia_proveedor: (c.guia_proveedor as string | null) ?? null,
        tracking: (c.tracking as string | null) ?? null,
        courier: (c.courier as string | null) ?? null,
        estado: c.estado as EstadoCompra,
        subtotal: Number(c.subtotal ?? 0),
        igv: Number(c.igv ?? 0),
        total: Number(c.total ?? 0),
        gastos_importacion: Number(c.gastos_importacion ?? 0),
        comprador: c.perfiles?.nombre ?? null,
        observaciones: (c.observaciones as string | null) ?? null,
        motivo_anulacion: (c.motivo_anulacion as string | null) ?? null,
        creado_en: String(c.creado_en),
        lineas,
        recepciones: c.recepciones ?? [],
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Proveedores activos, para el desplegable del registro y del filtro. */
export async function proveedoresActivos(): Promise<Resultado<ProveedorOpcion[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("proveedores")
      .select("id, codigo, razon_social, numero_documento, tipo, dias_pago, lead_time_dias")
      .eq("activo", true)
      .order("razon_social")
      .limit(500);

    if (error) return fallo(error);

    return {
      ok: true,
      datos: (data ?? []).map((p) => ({
        id: String(p.id),
        codigo: String(p.codigo),
        razon_social: String(p.razon_social),
        numero_documento: p.numero_documento ?? null,
        tipo: String(p.tipo ?? "local"),
        dias_pago: Number(p.dias_pago ?? 0),
        lead_time_dias: Number(p.lead_time_dias ?? 0),
      })),
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Qué se le ha comprado antes a este proveedor, y a qué precio.
 *
 * Es la pregunta que se hace al registrar: *«¿esto no me lo cobraba más
 * barato?»*. Devuelve el último costo por producto, no el histórico entero.
 */
export async function ultimosCostosDelProveedor(
  proveedorId: string,
): Promise<Resultado<Record<string, { costo: number; numero: string; fecha: string }>>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select(
        `numero, fecha, estado,
         compra_items(producto_id, costo_unitario)`,
      )
      .eq("proveedor_id", proveedorId)
      .neq("estado", "anulada")
      .order("numero", { ascending: false })
      .limit(20);

    if (error) return fallo(error);

    const crudas = (data ?? []) as unknown as Array<{
      numero: string;
      fecha: string;
      compra_items: { producto_id: string; costo_unitario: number }[] | null;
    }>;

    // Las compras llegan de más nueva a más vieja, así que la PRIMERA vez que
    // se ve un producto es la más reciente. Por eso no se sobrescribe.
    const ultimos: Record<string, { costo: number; numero: string; fecha: string }> = {};
    for (const c of crudas) {
      for (const i of c.compra_items ?? []) {
        if (ultimos[i.producto_id]) continue;
        ultimos[i.producto_id] = {
          costo: Number(i.costo_unitario ?? 0),
          numero: c.numero,
          fecha: c.fecha,
        };
      }
    }

    return { ok: true, datos: ultimos };
  } catch (e) {
    return fallo(e);
  }
}
