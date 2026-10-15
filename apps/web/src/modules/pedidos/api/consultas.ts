import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";

import { etapaDe, type Etapa } from "../dominio/etapa";

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
  /** Órdenes sin registrar la compra: lo que más se olvida. */
  porRegistrar: number;
}

type ColgadoCrudo = {
  compras: { estado: string; falta_factura: boolean }[] | null;
  guias_remision: { estado: string }[] | null;
  comprobantes: { tipo: string; estado: string; saldo: number | string }[] | null;
};

/** Lo que cuelga del pedido, como lo pide `etapaDe`. */
function colgado(f: ColgadoCrudo) {
  const compras = (f.compras ?? []).filter((k) => k.estado !== "anulada");
  return {
    compras,
    guiasEmitidas: (f.guias_remision ?? []).filter((g) => g.estado === "emitida").length,
    facturas: (f.comprobantes ?? [])
      .filter((c) => (c.tipo === "factura" || c.tipo === "boleta") && c.estado !== "anulado")
      .map((c) => ({ saldo: Number(c.saldo ?? 0) })),
  };
}

export async function listarPedidos(filtro: { cotizacionId?: string } = {}): Promise<Resultado<PedidoLista[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("pedidos")
      .select(
        `id, numero, secuencia, fecha, cotizacion_id,
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

    return {
      ok: true,
      datos: filas.map((f) => {
        const c = colgado(f);
        return {
          id: f.id,
          numero: f.numero,
          secuencia: f.secuencia,
          fecha: String(f.fecha),
          cotizacionId: f.cotizacion_id,
          cotizacion: f.cotizaciones?.numero ?? "—",
          cliente: f.clientes?.razon_social ?? "—",
          etapa: etapaDe(c),
          productos: lineas.get(f.id) ?? [],
          porRegistrar: c.compras.filter((k) => k.falta_factura && k.estado === "registrada").length,
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
  cotizacion: { id: string; numero: string; ordenCompraCliente: string | null; estado: string };
  cliente: string;
  /** Los demás pedidos de la misma cotización, para ir de uno a otro. */
  hermanos: { id: string; numero: string; secuencia: number }[];
  lineas: { codigo: string; descripcion: string; cantidad: number; unidad: string }[];
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
        `id, numero, secuencia, fecha, cotizacion_id,
         cotizaciones(id, numero, orden_compra_cliente, estado), clientes(razon_social),
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
      cotizaciones: { id: string; numero: string | null; orden_compra_cliente: string | null; estado: string } | null;
      clientes: { razon_social: string } | null;
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

    const [{ data: hermanos }, { data: lineas }] = await Promise.all([
      supabase.from("pedidos").select("id, numero, secuencia").eq("cotizacion_id", f.cotizacion_id).order("secuencia"),
      supabase
        .from("v_pedido_lineas")
        .select("codigo, descripcion, cantidad, unidad_codigo, orden")
        .eq("pedido_id", id)
        .gt("cantidad", 0)
        .order("orden"),
    ]);

    return {
      ok: true,
      datos: {
        id: f.id,
        numero: f.numero,
        secuencia: f.secuencia,
        fecha: String(f.fecha),
        etapa: etapaDe(colgado(f)),
        cotizacion: {
          id: f.cotizacion_id,
          numero: f.cotizaciones?.numero ?? "—",
          ordenCompraCliente: f.cotizaciones?.orden_compra_cliente ?? null,
          estado: f.cotizaciones?.estado ?? "",
        },
        cliente: f.clientes?.razon_social ?? "—",
        hermanos: (hermanos ?? []).map((h) => ({ id: h.id, numero: h.numero, secuencia: h.secuencia })),
        lineas: (lineas ?? []).map((l) => ({
          codigo: String(l.codigo),
          descripcion: String(l.descripcion),
          cantidad: Number(l.cantidad),
          unidad: String(l.unidad_codigo ?? "NIU"),
        })),
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

/** El pedido vigente de una cotización: el último. */
export async function pedidoVigente(cotizacionId: string): Promise<string | null> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("pedidos")
    .select("id")
    .eq("cotizacion_id", cotizacionId)
    .order("secuencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
