import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
import { bandejaPorComprar, loQueFaltaDe } from "@/modules/compras";

import { etapaDe, type DespachoDelPedido, type Etapa } from "../dominio/etapa";
import { comprasPorProducto, type EstadoSunatFactura, type FilaPedido } from "../dominio/lista";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Un pedido en la lista (130). */
export interface PedidoLista {
  id: string;
  numero: string;
  secuencia: number;
  fecha: string;
  cotizacionId: string;
  cotizacion: string;
  cliente: string;
  etapa: Etapa;
  /** «6202-2Z × 4 · 729865B × 3». */
  productos: { codigo: string; cantidad: number }[];
  /** Cuánto salió y cuánto se facturó (161). Null si no se pudo leer. */
  despacho: DespachoDelPedido | null;
  /** Órdenes sin registrar la compra: lo que más se olvida. */
  porRegistrar: number;
  /** Anulado (188): se enseña, pero ya no es vigente. */
  anulado?: boolean;
}

type ColgadoCrudo = {
  compras: { estado: string; falta_factura: boolean }[] | null;
  guias_remision: { estado: string }[] | null;
  comprobantes: { tipo: string; estado: string; saldo: number | string }[] | null;
};

/** Lo que cuelga del pedido, como lo pide `etapaDe`. */
function colgado(f: ColgadoCrudo, despacho: DespachoDelPedido | null = null) {
  const compras = (f.compras ?? []).filter((k) => k.estado !== "anulada");
  return {
    compras,
    guiasEmitidas: (f.guias_remision ?? []).filter((g) => g.estado === "emitida").length,
    facturas: (f.comprobantes ?? [])
      .filter((c) => (c.tipo === "factura" || c.tipo === "boleta") && c.estado !== "anulado")
      .map((c) => ({ saldo: Number(c.saldo ?? 0) })),
    despacho,
  };
}

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * Cuánto salió y cuánto se facturó de cada pedido (161, `v_pedido_avance`):
 * la misma cuenta que usa el aviso de pedido a medio despachar.
 *
 * Si la lectura falla se apunta y se devuelve el mapa vacío: la etapa se
 * decide entonces como antes de la 161 (`etapaDe` sin despacho), que es peor
 * pero no miente con una cifra inventada.
 */
async function avanceDe(supabase: Cliente, ids: readonly string[]): Promise<Map<string, DespachoDelPedido>> {
  const mapa = new Map<string, DespachoDelPedido>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("v_pedido_avance")
      .select("pedido_id, confirmado, despachado, facturado")
      .in("pedido_id", ids.slice(i, i + 200));
    if (error) {
      fallo(error, "pedidos/avanceDe");
      return new Map();
    }
    for (const a of data ?? []) {
      if (!a.pedido_id) continue;
      mapa.set(String(a.pedido_id), {
        confirmado: Number(a.confirmado ?? 0),
        despachado: Number(a.despachado ?? 0),
        facturado: Number(a.facturado ?? 0),
      });
    }
  }
  return mapa;
}

export async function listarPedidos(filtro: { cotizacionId?: string } = {}): Promise<Resultado<PedidoLista[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("pedidos")
      .select(
        `id, numero, secuencia, fecha, cotizacion_id, anulado,
         cotizaciones(numero), clientes(razon_social),
         compras(estado, falta_factura),
         guias_remision(estado),
         comprobantes(tipo, estado, saldo)`,
      )
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(300);
    if (filtro.cotizacionId) consulta = consulta.eq("cotizacion_id", filtro.cotizacionId);
    const { data, error } = await consulta;
    if (error) return fallo(error, "pedidos/listarPedidos");

    const filas = (data ?? []) as unknown as (ColgadoCrudo & {
      id: string;
      numero: string;
      secuencia: number;
      fecha: string;
      cotizacion_id: string;
      anulado: boolean;
      cotizaciones: { numero: string | null } | null;
      clientes: { razon_social: string } | null;
    })[];

    const ids = filas.map((f) => f.id);
    const lineas = new Map<string, { codigo: string; cantidad: number }[]>();
    if (ids.length > 0) {
      const { data: ls } = await supabase
        .from("v_pedido_lineas")
        .select("pedido_id, codigo, cantidad, orden")
        .in("pedido_id", ids)
        .gt("cantidad", 0)
        .order("orden");
      for (const l of ls ?? []) {
        const k = String(l.pedido_id);
        lineas.set(k, [...(lineas.get(k) ?? []), { codigo: String(l.codigo), cantidad: Number(l.cantidad) }]);
      }
    }
    const avance = await avanceDe(supabase, ids);

    return {
      ok: true,
      datos: filas.map((f) => {
        const despacho = avance.get(f.id) ?? null;
        const c = colgado(f, despacho);
        return {
          id: f.id,
          numero: f.numero,
          secuencia: f.secuencia,
          fecha: String(f.fecha),
          cotizacionId: f.cotizacion_id,
          cotizacion: f.cotizaciones?.numero ?? "—",
          cliente: f.clientes?.razon_social ?? "—",
          etapa: etapaDe(c),
          despacho,
          productos: lineas.get(f.id) ?? [],
          porRegistrar: c.compras.filter((k) => k.falta_factura && k.estado === "registrada").length,
          anulado: Boolean(f.anulado),
        };
      }),
    };
  } catch (e) {
    return fallo(e, "pedidos/listarPedidos");
  }
}

export interface PedidoDetalle {
  id: string;
  numero: string;
  secuencia: number;
  fecha: string;
  etapa: Etapa;
  /** Cuánto salió y cuánto se facturó (161). Null si no se pudo leer. */
  despacho: DespachoDelPedido | null;
  cotizacion: { id: string; numero: string; ordenCompraCliente: string | null; estado: string };
  cliente: string;
  /** Para el botón «Ficha del cliente» (FS-08). */
  clienteId: string | null;
  /** Los demás pedidos de la misma cotización, para ir de uno a otro. */
  hermanos: { id: string; numero: string; secuencia: number; anulado: boolean }[];
  /**
   * Anulado (188): se queda con su motivo, y sus líneas salen de la foto que
   * se guardó al anularlo. Null si está vivo.
   */
  anulado: { motivo: string | null; en: string | null; por: string | null } | null;
  lineas: {
    /** La línea de la cotización (169: para numerar 1, 1.1…). */
    id: string;
    /** Su producto del catálogo, o null si es una línea libre (04/11). */
    productoId: string | null;
    alternativaDe: string | null;
    codigo: string;
    marca: string | null;
    descripcion: string;
    cantidad: number;
    unidad: string;
    /** En dólares y sin IGV, como en la cotización. */
    valorUnitario: number;
    descuentoPct: number;
  }[];
  /** Lo que la hoja de pedido necesita y la ficha no enseña. */
  papel: {
    moneda: "USD" | "PEN";
    tipoCambio: number | null;
    clienteDocumento: string | null;
    clienteDireccion: string | null;
  };
  guias: { id: string; numero: string; estado: string; fecha: string }[];
  facturas: {
    id: string;
    numero: string;
    tipo: string;
    estado: string;
    total: number;
    saldo: number;
    moneda: "USD" | "PEN";
  }[];
}

export async function detallePedido(id: string): Promise<Resultado<PedidoDetalle | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `id, numero, secuencia, fecha, cotizacion_id, cliente_id,
         anulado, anulado_en, motivo_anulacion, lineas_anuladas, anulador:perfiles!pedidos_anulado_por_fkey(nombre),
         cotizaciones(id, numero, orden_compra_cliente, estado, moneda, tipo_cambio),
         clientes(razon_social, tipo_documento, numero_documento, direccion),
         compras(estado, falta_factura),
         guias_remision(id, numero, estado, fecha_emision),
         comprobantes(id, numero, tipo, estado, total, saldo, moneda, pen_total)`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return fallo(error, "pedidos/detallePedido");
    if (!data) return { ok: true, datos: null };

    const f = data as unknown as Pick<ColgadoCrudo, "compras"> & {
      id: string;
      numero: string;
      secuencia: number;
      fecha: string;
      cotizacion_id: string;
      cliente_id: string | null;
      cotizaciones: {
        id: string;
        numero: string | null;
        orden_compra_cliente: string | null;
        estado: string;
        moneda: string | null;
        tipo_cambio: number | null;
      } | null;
      clientes: {
        razon_social: string;
        tipo_documento: string | null;
        numero_documento: string | null;
        direccion: string | null;
      } | null;
      guias_remision: { id: string; numero: string | null; estado: string; fecha_emision: string }[] | null;
      comprobantes:
        | {
            id: string;
            numero: string | null;
            tipo: string;
            estado: string;
            total: number;
            saldo: number;
            moneda: string | null;
            pen_total: number | null;
          }[]
        | null;
    };

    const [{ data: hermanos }, { data: lineas }, { data: marcas }, avance] = await Promise.all([
      supabase.from("pedidos").select("id, numero, secuencia, anulado").eq("cotizacion_id", f.cotizacion_id).order("secuencia"),
      supabase
        .from("v_pedido_lineas")
        .select("cotizacion_item_id, producto_id, codigo, descripcion, cantidad, unidad_codigo, valor_unitario, descuento_pct, orden")
        .eq("pedido_id", id)
        .gt("cantidad", 0)
        .order("orden"),
      // La marca no está en la vista; sale de la línea de la cotización. Y de
      // ahí también de qué línea es alternativa (169).
      supabase.from("cotizacion_items").select("id, marca, alternativa_de").eq("cotizacion_id", f.cotizacion_id),
      avanceDe(supabase, [id]),
    ]);
    const despacho = avance.get(id) ?? null;
    const marcaDe = new Map((marcas ?? []).map((m) => [m.id, m.marca]));
    const alternativaDe = new Map((marcas ?? []).map((m) => [m.id, m.alternativa_de]));
    const tc = Number(f.cotizaciones?.tipo_cambio ?? 0);
    // 188: el anulado guarda lo que pedía; la cotización puede haber cambiado.
    const a = f as unknown as {
      anulado: boolean;
      anulado_en: string | null;
      motivo_anulacion: string | null;
      lineas_anuladas: { codigo: string; descripcion: string; cantidad: number; unidad_codigo: string; valor_unitario: number; descuento_pct: number }[] | null;
      anulador: { nombre: string | null } | null;
    };
    const lineasDelPedido = a.anulado
      ? (a.lineas_anuladas ?? []).map((l, i) => ({
          id: `anulada-${i + 1}`,
          productoId: null,
          alternativaDe: null,
          codigo: String(l.codigo),
          marca: null,
          descripcion: String(l.descripcion),
          cantidad: Number(l.cantidad),
          unidad: String(l.unidad_codigo ?? "NIU"),
          valorUnitario: Number(l.valor_unitario ?? 0),
          descuentoPct: Number(l.descuento_pct ?? 0),
        }))
      : null;

    return {
      ok: true,
      datos: {
        id: f.id,
        anulado: a.anulado
          ? { motivo: a.motivo_anulacion, en: a.anulado_en, por: a.anulador?.nombre ?? null }
          : null,
        numero: f.numero,
        secuencia: f.secuencia,
        fecha: String(f.fecha),
        etapa: etapaDe(colgado(f, despacho)),
        despacho,
        cotizacion: {
          id: f.cotizacion_id,
          numero: f.cotizaciones?.numero ?? "—",
          ordenCompraCliente: f.cotizaciones?.orden_compra_cliente ?? null,
          estado: f.cotizaciones?.estado ?? "",
        },
        cliente: f.clientes?.razon_social ?? "—",
        clienteId: f.cliente_id ?? null,
        hermanos: (hermanos ?? []).map((h) => ({ id: h.id, numero: h.numero, secuencia: h.secuencia, anulado: Boolean(h.anulado) })),
        lineas: lineasDelPedido ?? (lineas ?? []).map((l) => ({
          id: String(l.cotizacion_item_id),
          productoId: l.producto_id ? String(l.producto_id) : null,
          alternativaDe: alternativaDe.get(String(l.cotizacion_item_id)) ?? null,
          codigo: String(l.codigo),
          marca: marcaDe.get(String(l.cotizacion_item_id)) ?? null,
          descripcion: String(l.descripcion),
          cantidad: Number(l.cantidad),
          unidad: String(l.unidad_codigo ?? "NIU"),
          valorUnitario: Number(l.valor_unitario ?? 0),
          descuentoPct: Number(l.descuento_pct ?? 0),
        })),
        papel: {
          moneda: f.cotizaciones?.moneda === "PEN" && tc > 0 ? "PEN" : "USD",
          tipoCambio: tc > 0 ? tc : null,
          clienteDocumento: f.clientes?.numero_documento
            ? `${f.clientes.tipo_documento ?? "RUC"} ${f.clientes.numero_documento}`
            : null,
          clienteDireccion: f.clientes?.direccion ?? null,
        },
        guias: (f.guias_remision ?? [])
          .filter((g) => g.estado !== "anulada")
          .map((g) => ({ id: g.id, numero: g.numero ?? "(borrador)", estado: g.estado, fecha: String(g.fecha_emision) })),
        facturas: (f.comprobantes ?? [])
          .filter((c) => c.estado !== "anulado")
          .map((c) => {
            const enSoles = c.moneda === "PEN" && c.pen_total != null;
            const factor = enSoles && Number(c.total) > 0 ? Number(c.pen_total) / Number(c.total) : 1;
            return {
              id: c.id,
              numero: c.numero ?? "—",
              tipo: c.tipo,
              estado: c.estado,
              // En su moneda (116): el saldo en soles, en proporción.
              total: enSoles ? Number(c.pen_total) : Number(c.total),
              saldo: Math.round(Number(c.saldo) * factor * 100) / 100,
              moneda: enSoles ? "PEN" : "USD",
            };
          }),
      },
    };
  } catch (e) {
    return fallo(e, "pedidos/detallePedido");
  }
}

/** Una recepción de una orden del pedido, para decir si la mercadería ya entró. */
export interface RecepcionDeOrden {
  id: string;
  numero: string;
  fecha: string;
}

/**
 * Las recepciones de cada orden del pedido, por id de compra (TR-13).
 *
 * «¿Ya llegó lo del pedido?» obligaba a abrir cada compra: la ficha del
 * pedido enlazaba la orden y la orden enlazaba su recepción. Las anuladas no
 * cuentan: una recepción anulada es mercadería que no entró.
 *
 * Si la consulta falla devuelve un mapa vacío y la ficha dice «Todavía no ha
 * llegado» — que es lo que diría también si no hubiera nada. Por eso el fallo
 * se apunta (`fallo`) en vez de tragárselo.
 */
export async function recepcionesDeLasOrdenes(pedidoId: string): Promise<Map<string, RecepcionDeOrden[]>> {
  const porCompra = new Map<string, RecepcionDeOrden[]>();
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select("id, recepciones(id, numero, fecha, anulada)")
      .eq("pedido_id", pedidoId);
    if (error) {
      fallo(error, "pedidos/recepcionesDeLasOrdenes");
      return porCompra;
    }
    const filas = (data ?? []) as unknown as {
      id: string;
      recepciones: { id: string; numero: string | null; fecha: string; anulada: boolean | null }[] | null;
    }[];
    for (const f of filas) {
      const vivas = (f.recepciones ?? [])
        .filter((r) => r.anulada !== true)
        .map((r) => ({ id: r.id, numero: r.numero ?? "—", fecha: String(r.fecha) }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (vivas.length > 0) porCompra.set(f.id, vivas);
    }
    return porCompra;
  } catch (e) {
    fallo(e, "pedidos/recepcionesDeLasOrdenes");
    return porCompra;
  }
}

/** Una compra ya hecha (con su factura) cuya mercadería no se recibió entera. */
export interface CompraSinRecibir {
  id: string;
  numero: string;
  proveedor: string;
  fecha: string;
  /** Si es una orden de ESTE pedido. */
  delPedido: boolean;
  productos: { codigo: string; falta: number }[];
}

/**
 * Las compras de estos productos que ya se compraron y no se recibieron
 * (04/11). La OC02-00005 se registró con su factura y nadie la recibió: el
 * stock no se enteró y la cotización siguiente pidió comprar otra vez. Willy:
 * *«yo pensé que al ingresar la factura ya estaba recibiendo»*. Esto lo
 * dice en el pedido, con el botón de recibir.
 */
export async function comprasSinRecibir(productoIds: string[], pedidoId: string): Promise<CompraSinRecibir[]> {
  const ids = [...new Set(productoIds)].filter(Boolean);
  if (ids.length === 0) return [];
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("compras")
      .select(
        `id, numero, fecha, pedido_id, documento_proveedor, proveedores(razon_social),
         compra_items!inner(producto_id, cantidad, cantidad_recibida, productos(codigo))`,
      )
      .in("estado", ["registrada", "recibida_parcial"])
      // Comprada = registrada, con o sin número de factura (187).
      .eq("falta_factura", false)
      .in("compra_items.producto_id", ids)
      .order("fecha", { ascending: true })
      .limit(30);
    if (error) {
      fallo(error, "pedidos/comprasSinRecibir");
      return [];
    }
    const filas = (data ?? []) as unknown as {
      id: string;
      numero: string;
      fecha: string;
      pedido_id: string | null;
      proveedores: { razon_social: string } | null;
      compra_items: { producto_id: string; cantidad: number; cantidad_recibida: number; productos: { codigo: string } | null }[];
    }[];
    return filas
      .map((f) => ({
        id: f.id,
        numero: f.numero,
        proveedor: f.proveedores?.razon_social ?? "—",
        fecha: String(f.fecha),
        delPedido: f.pedido_id === pedidoId,
        productos: f.compra_items
          .map((i) => ({
            codigo: i.productos?.codigo ?? "—",
            falta: Math.round((Number(i.cantidad ?? 0) - Number(i.cantidad_recibida ?? 0)) * 100) / 100,
          }))
          .filter((i) => i.falta > 0),
      }))
      .filter((c) => c.productos.length > 0);
  } catch (e) {
    fallo(e, "pedidos/comprasSinRecibir");
    return [];
  }
}

/** El pedido vigente de una cotización: el último. */
export async function pedidoVigente(cotizacionId: string): Promise<string | null> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("pedidos")
    .select("id")
    .eq("cotizacion_id", cotizacionId)
    .eq("anulado", false)
    .order("secuencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Las filas de la tabla de pedidos (131), con todo lo que cuelga de cada uno:
 * venta y costo, compras, guía, facturas con su cobro y su SUNAT. El periodo
 * se filtra aquí (por la fecha del pedido); lo demás, en `dominio/lista`.
 */
export async function filasDePedidos(periodo: { desde?: string; hasta?: string }): Promise<Resultado<FilaPedido[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("pedidos")
      .select(
        `id, numero, secuencia, fecha, cotizacion_id, cliente_id, anulado, motivo_anulacion, lineas_anuladas,
         cotizaciones(numero, moneda, tipo_cambio), clientes(razon_social),
         compras(estado, falta_factura, compra_items(producto_id)),
         guias_remision(id, numero, estado),
         comprobantes(id, numero, tipo, estado, saldo, total, moneda, pen_total, estado_sunat, fecha_vencimiento)`,
      )
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(1000);
    if (periodo.desde) consulta = consulta.gte("fecha", periodo.desde);
    if (periodo.hasta) consulta = consulta.lte("fecha", periodo.hasta);
    const { data, error } = await consulta;
    if (error) return fallo(error, "pedidos/filasDePedidos");

    const filas = (data ?? []) as unknown as {
      id: string;
      numero: string;
      secuencia: number;
      fecha: string;
      cotizacion_id: string;
      cliente_id: string;
      anulado: boolean;
      motivo_anulacion: string | null;
      lineas_anuladas: { codigo: string; cantidad: number; importe: number }[] | null;
      cotizaciones: { numero: string | null; moneda: string | null; tipo_cambio: number | null } | null;
      clientes: { razon_social: string } | null;
      compras: { estado: string; falta_factura: boolean; compra_items: { producto_id: string }[] | null }[] | null;
      guias_remision: { id: string; numero: string | null; estado: string }[] | null;
      comprobantes:
        | {
            id: string;
            numero: string | null;
            tipo: string;
            estado: string;
            saldo: number;
            total: number;
            moneda: string | null;
            pen_total: number | null;
            estado_sunat: string;
            fecha_vencimiento: string | null;
          }[]
        | null;
    }[];

    const ids = filas.map((f) => f.id);
    /** Los productos del catálogo de cada pedido, para contar compras por producto (04/11). */
    const productosDe = new Map<string, string[]>();
    const dinero = new Map<string, { venta: number; costo: number; productos: { codigo: string; cantidad: number }[] }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: ls, error: el } = await supabase
        .from("v_pedido_lineas")
        .select("pedido_id, producto_id, codigo, cantidad, importe, costo, orden")
        .in("pedido_id", ids.slice(i, i + 200))
        .gt("cantidad", 0)
        .order("orden");
      if (el) return fallo(el, "pedidos/filasDePedidos");
      for (const l of ls ?? []) {
        const k = String(l.pedido_id);
        const d = dinero.get(k) ?? { venta: 0, costo: 0, productos: [] };
        d.venta += Number(l.importe ?? 0);
        d.costo += Number(l.costo ?? 0);
        d.productos.push({ codigo: String(l.codigo), cantidad: Number(l.cantidad) });
        dinero.set(k, d);
        if (l.producto_id) productosDe.set(k, [...(productosDe.get(k) ?? []), String(l.producto_id)]);
      }
    }

    const avance = await avanceDe(supabase, ids);

    // El último pedido de cada cotización, aunque caiga fuera del periodo.
    const ultimo = new Map<string, number>();
    const cots = [...new Set(filas.map((f) => f.cotizacion_id))];
    for (let i = 0; i < cots.length; i += 200) {
      const { data: ps, error: ep } = await supabase
        .from("pedidos")
        .select("cotizacion_id, secuencia")
        .in("cotizacion_id", cots.slice(i, i + 200))
        // 188: el vigente es el último que NO está anulado.
        .eq("anulado", false);
      if (ep) return fallo(ep, "pedidos/filasDePedidos");
      for (const p of ps ?? []) {
        ultimo.set(p.cotizacion_id, Math.max(ultimo.get(p.cotizacion_id) ?? 0, p.secuencia));
      }
    }

    /*
      «Sin órdenes» no decía nada (Willy, 16/10: «¿eso se entiende como que
      está pendiente de comprarlo o como que tengo en stock?»). Para el pedido
      vigente sin órdenes se mira la bandeja —el mismo reparto del stock que
      la ficha—: si le falta algo, falta hacer la orden; si no, sale del
      almacén. Una sola lectura para toda la lista, y solo si hace falta.
    */
    /*
      Y desde el 04/11, para todos los vigentes: qué productos no cubre el
      almacén, para contar «1 de 2» por producto.
    */
    const vigentes = filas.filter((f) => !f.anulado && (ultimo.get(f.cotizacion_id) ?? f.secuencia) === f.secuencia);
    const faltaPorCotizacion = new Map<string, number>();
    const faltaDelAlmacen = new Map<string, Set<string>>();
    if (vigentes.length > 0) {
      const b = await bandejaPorComprar();
      if (b.ok) {
        for (const f of vigentes) {
          const falta = loQueFaltaDe(f.cotizacion_id, b.datos.filas);
          faltaPorCotizacion.set(f.cotizacion_id, falta.length);
          faltaDelAlmacen.set(f.id, new Set(falta.map((x) => x.producto_id)));
        }
      }
    }

    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const sunat = (e: string): EstadoSunatFactura =>
      e === "aceptado" || e === "observado" ? "aceptado" : e === "rechazado" ? "rechazado" : "pendiente";

    return {
      ok: true,
      datos: filas.map((f): FilaPedido => {
        // 188: lo del anulado sale de su foto, y no suma en las cifras.
        const d = f.anulado
          ? {
              venta: (f.lineas_anuladas ?? []).reduce((s, l) => s + Number(l.importe ?? 0), 0),
              costo: 0,
              productos: (f.lineas_anuladas ?? []).map((l) => ({ codigo: String(l.codigo), cantidad: Number(l.cantidad) })),
            }
          : (dinero.get(f.id) ?? { venta: 0, costo: 0, productos: [] });
        const compras = (f.compras ?? []).filter((k) => k.estado !== "anulada");
        const guias = (f.guias_remision ?? []).filter((g) => g.estado !== "anulada");
        const guia = guias.find((g) => g.estado === "emitida") ?? guias[0] ?? null;
        const facturas = (f.comprobantes ?? []).filter(
          (c) => (c.tipo === "factura" || c.tipo === "boleta") && c.estado !== "anulado",
        );
        const despacho = avance.get(f.id) ?? null;
        const colg = {
          compras,
          guiasEmitidas: guias.filter((g) => g.estado === "emitida").length,
          facturas: facturas.map((c) => ({ saldo: Number(c.saldo ?? 0) })),
          despacho,
        };
        return {
          id: f.id,
          numero: f.numero,
          secuencia: f.secuencia,
          fecha: String(f.fecha),
          cotizacionId: f.cotizacion_id,
          cotizacion: f.cotizaciones?.numero ?? "—",
          clienteId: f.cliente_id,
          cliente: f.clientes?.razon_social ?? "—",
          moneda: f.cotizaciones?.moneda === "PEN" ? "PEN" : "USD",
          tipoCambio: Number(f.cotizaciones?.tipo_cambio) > 0 ? Number(f.cotizaciones?.tipo_cambio) : null,
          venta: Math.round(d.venta * 100) / 100,
          costo: Math.round(d.costo * 100) / 100,
          compras: {
            total: compras.length,
            porRegistrar: compras.filter((k) => k.falta_factura && k.estado === "registrada").length,
            faltaPedir: compras.length === 0 ? (faltaPorCotizacion.get(f.cotizacion_id) ?? 0) : 0,
            ...comprasPorProducto(
              productosDe.get(f.id) ?? [],
              compras.map((k) => ({
                falta_factura: k.falta_factura,
                estado: k.estado,
                productos: (k.compra_items ?? []).map((x) => x.producto_id),
              })),
              faltaDelAlmacen.get(f.id) ?? new Set(),
            ),
          },
          guia: guia ? { id: guia.id, numero: guia.numero ?? "borrador", emitida: guia.estado === "emitida" } : null,
          facturas: facturas.map((c) => {
            const enSoles = c.moneda === "PEN" && c.pen_total != null && Number(c.total) > 0;
            const saldoUsd = Number(c.saldo ?? 0);
            return {
              id: c.id,
              numero: c.numero ?? "—",
              saldoUsd,
              saldo: enSoles ? Math.round(((saldoUsd * Number(c.pen_total)) / Number(c.total)) * 100) / 100 : saldoUsd,
              moneda: enSoles ? "PEN" : "USD",
              vencida: saldoUsd > 0.005 && !!c.fecha_vencimiento && c.fecha_vencimiento < hoy,
              sunat: sunat(c.estado_sunat),
            };
          }),
          etapa: etapaDe(colg),
          despacho,
          productos: d.productos,
          vigente: !f.anulado && (ultimo.get(f.cotizacion_id) ?? f.secuencia) === f.secuencia,
          anulado: f.anulado ? { motivo: f.motivo_anulacion } : null,
        };
      }),
    };
  } catch (e) {
    return fallo(e, "pedidos/filasDePedidos");
  }
}
