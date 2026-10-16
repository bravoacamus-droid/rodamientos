import "server-only";

import { clienteServidor } from "@rodatech/db/servidor";

import { fallo } from "@/lib/errores";
import { bandejaPorComprar, loQueFaltaDe } from "@/modules/compras";

import { etapaDe, type Etapa } from "../dominio/etapa";
import type { EstadoSunatFactura, FilaPedido } from "../dominio/lista";

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
  lineas: {
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
        `id, numero, secuencia, fecha, cotizacion_id,
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

    const [{ data: hermanos }, { data: lineas }, { data: marcas }] = await Promise.all([
      supabase.from("pedidos").select("id, numero, secuencia").eq("cotizacion_id", f.cotizacion_id).order("secuencia"),
      supabase
        .from("v_pedido_lineas")
        .select("cotizacion_item_id, codigo, descripcion, cantidad, unidad_codigo, valor_unitario, descuento_pct, orden")
        .eq("pedido_id", id)
        .gt("cantidad", 0)
        .order("orden"),
      // La marca no está en la vista; sale de la línea de la cotización.
      supabase.from("cotizacion_items").select("id, marca").eq("cotizacion_id", f.cotizacion_id),
    ]);
    const marcaDe = new Map((marcas ?? []).map((m) => [m.id, m.marca]));
    const tc = Number(f.cotizaciones?.tipo_cambio ?? 0);

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
        `id, numero, secuencia, fecha, cotizacion_id, cliente_id,
         cotizaciones(numero, moneda, tipo_cambio), clientes(razon_social),
         compras(estado, falta_factura),
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
      cotizaciones: { numero: string | null; moneda: string | null; tipo_cambio: number | null } | null;
      clientes: { razon_social: string } | null;
      compras: { estado: string; falta_factura: boolean }[] | null;
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
    const dinero = new Map<string, { venta: number; costo: number; productos: { codigo: string; cantidad: number }[] }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: ls, error: el } = await supabase
        .from("v_pedido_lineas")
        .select("pedido_id, codigo, cantidad, importe, costo, orden")
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
      }
    }

    // El último pedido de cada cotización, aunque caiga fuera del periodo.
    const ultimo = new Map<string, number>();
    const cots = [...new Set(filas.map((f) => f.cotizacion_id))];
    for (let i = 0; i < cots.length; i += 200) {
      const { data: ps, error: ep } = await supabase
        .from("pedidos")
        .select("cotizacion_id, secuencia")
        .in("cotizacion_id", cots.slice(i, i + 200));
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
    const sinOrdenes = filas.filter(
      (f) =>
        (f.compras ?? []).every((k) => k.estado === "anulada") &&
        (ultimo.get(f.cotizacion_id) ?? f.secuencia) === f.secuencia,
    );
    const faltaPorCotizacion = new Map<string, number>();
    if (sinOrdenes.length > 0) {
      const b = await bandejaPorComprar();
      if (b.ok) {
        for (const f of sinOrdenes) {
          faltaPorCotizacion.set(f.cotizacion_id, loQueFaltaDe(f.cotizacion_id, b.datos.filas).length);
        }
      }
    }

    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const sunat = (e: string): EstadoSunatFactura =>
      e === "aceptado" || e === "observado" ? "aceptado" : e === "rechazado" ? "rechazado" : "pendiente";

    return {
      ok: true,
      datos: filas.map((f): FilaPedido => {
        const d = dinero.get(f.id) ?? { venta: 0, costo: 0, productos: [] };
        const compras = (f.compras ?? []).filter((k) => k.estado !== "anulada");
        const guias = (f.guias_remision ?? []).filter((g) => g.estado !== "anulada");
        const guia = guias.find((g) => g.estado === "emitida") ?? guias[0] ?? null;
        const facturas = (f.comprobantes ?? []).filter(
          (c) => (c.tipo === "factura" || c.tipo === "boleta") && c.estado !== "anulado",
        );
        const colg = {
          compras,
          guiasEmitidas: guias.filter((g) => g.estado === "emitida").length,
          facturas: facturas.map((c) => ({ saldo: Number(c.saldo ?? 0) })),
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
          productos: d.productos,
          vigente: (ultimo.get(f.cotizacion_id) ?? f.secuencia) === f.secuencia,
        };
      }),
    };
  } catch (e) {
    return fallo(e, "pedidos/filasDePedidos");
  }
}
